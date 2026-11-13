import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/auth-helpers"
import { MomentSchema } from "@/lib/validations"

/**
 * 动态管理（需要「动态管理」权限；站长恒有）。
 *
 * 2026-11 调整：原来只有站长能发动态，现在把「动态管理」作为一项可授予
 * 读者的内容权限 —— 与「文章管理」并列。相机权限码 photo/poem 已废弃，
 * 存量的 photo/poem 在 src/lib/permissions.ts 里会自动按 moment 读取。
 */

export async function GET() {
  const auth = await requirePermission("moment")
  if (auth instanceof NextResponse) return auth

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
  const auth = await requirePermission("moment")
  if (auth instanceof NextResponse) return auth

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
        /*
         * 记录作者：没有这一行，"这条动态是谁发的"就无从判断。
         * 之前漏了它，导致后台列表的作者列全空、也没法做"只能改自己的"校验。
         */
        authorId: Number.parseInt(auth.id, 10) || null,
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
