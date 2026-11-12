import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { MomentSchema } from "@/lib/validations"

/**
 * 动态管理（站长专属）。
 *
 * 为什么是 requireOwner 而不是按内容权限：
 * 动态是这个站的「内容流总入口」（图文 + 诗句），发布权收在站长手里最清楚；
 * 授权读者仍可在文章/相册那边按权限协作。
 */

export async function GET() {
  const authError = await requireOwner()
  if (authError) return authError

  const moments = await prisma.moment.findMany({
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      _count: { select: { comments: true } },
    },
  })

  return NextResponse.json(moments)
}

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求体不是合法的 JSON" }, { status: 400 })
    }

    const parsed = MomentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "参数不合法" },
        { status: 400 }
      )
    }
    const data = parsed.data

    /*
     * 空动态没有意义，还会把信息流撑出一堆空白卡片。
     * 前端有同样的检查，但服务端必须自己也拦一道（接口是公开可调的）。
     */
    const hasText = Boolean(data.text && data.text.trim().length > 0)
    const hasImages = (data.images?.length ?? 0) > 0
    if (!hasText && !hasImages) {
      return NextResponse.json(
        { error: "动态至少要有一段文字或一张图片" },
        { status: 400 }
      )
    }

    const moment = await prisma.moment.create({
      data: {
        kind: data.kind,
        topic: data.topic ?? null,
        title: data.title ?? null,
        text: data.text ?? null,
        poemAuthor: data.poemAuthor ?? null,
        poemSource: data.poemSource ?? null,
        published: data.published ?? true,
        sortOrder: data.sortOrder ?? 0,
        images: {
          create: (data.images ?? []).map((image, index) => ({
            url: image.url,
            width: image.width ?? null,
            height: image.height ?? null,
            sortOrder: index,
          })),
        },
      },
      include: { images: true },
    })

    return NextResponse.json(moment, { status: 201 })
  } catch (error) {
    console.error("Create moment error:", error)
    return NextResponse.json({ error: "创建动态失败" }, { status: 500 })
  }
}
