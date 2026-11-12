import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/auth-helpers"
import { MomentUpdateSchema } from "@/lib/validations"

/** 解析并校验路径里的动态 id（不合法返回 400，而不是让 NaN 流进 Prisma 变 500） */
async function readId(params: Promise<{ id: string }>) {
  const { id } = await params
  const parsed = Number.parseInt(id, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("moment")
  if (auth instanceof NextResponse) return auth

  const id = await readId(params)
  if (id === null) return NextResponse.json({ error: "动态 ID 不合法" }, { status: 400 })

  try {
    const existing = await prisma.moment.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "动态不存在" }, { status: 404 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400 })
    }

    const parsed = MomentUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "参数不合法" },
        { status: 400 }
      )
    }
    const data = parsed.data

    /*
     * 更新后不能变成「既没文字也没图」的空动态：
     * 局部更新时要用「请求值 ?? 库里现值」算生效值，只看请求体会漏判。
     */
    const effectiveText = data.text !== undefined ? data.text : existing.text
    const effectiveImages =
      data.images !== undefined
        ? data.images.length
        : await prisma.momentImage.count({ where: { momentId: id } })
    if (!(effectiveText && effectiveText.trim().length > 0) && effectiveImages === 0) {
      return NextResponse.json(
        { error: "动态至少要有一段文字或一张图片" },
        { status: 400 }
      )
    }

    /*
     * 图片采用「整批替换」语义：传了 images 就以此为准（先删后建）。
     * 局部增删在界面上很别扭，而动态最多 9 张图，整批替换更简单可靠。
     */
    const moment = await prisma.$transaction(async (tx) => {
      if (data.images !== undefined) {
        await tx.momentImage.deleteMany({ where: { momentId: id } })
      }
      return tx.moment.update({
        where: { id },
        data: {
          ...(data.kind !== undefined ? { kind: data.kind } : {}),
          ...(data.topic !== undefined ? { topic: data.topic } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.text !== undefined ? { text: data.text } : {}),
          ...(data.poemAuthor !== undefined ? { poemAuthor: data.poemAuthor } : {}),
          ...(data.poemSource !== undefined ? { poemSource: data.poemSource } : {}),
          ...(data.published !== undefined ? { published: data.published } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.images !== undefined
            ? {
                images: {
                  create: data.images.map((image, index) => ({
                    url: image.url,
                    width: image.width ?? null,
                    height: image.height ?? null,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
        include: { images: true },
      })
    })

    return NextResponse.json(moment)
  } catch (error) {
    console.error("Update moment error:", error)
    return NextResponse.json({ error: "更新动态失败" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("moment")
  if (auth instanceof NextResponse) return auth

  const id = await readId(params)
  if (id === null) return NextResponse.json({ error: "动态 ID 不合法" }, { status: 400 })

  try {
    const existing = await prisma.moment.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "动态不存在" }, { status: 404 })

    // 图片与评论由外键级联删除（schema 里都是 onDelete: Cascade）
    await prisma.moment.delete({ where: { id } })
    return NextResponse.json({ message: "动态已删除" })
  } catch (error) {
    console.error("Delete moment error:", error)
    return NextResponse.json({ error: "删除动态失败" }, { status: 500 })
  }
}
