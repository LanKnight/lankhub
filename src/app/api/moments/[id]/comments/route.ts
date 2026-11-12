import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { CommentSchema } from "@/lib/validations"

/**
 * 动态的评论接口。
 *
 * 与 `/api/articles/[id]/comments` 完全对称（同样的限流、同样的 schema、
 * 同样的嵌套树），唯一的差别是校验对象换成 Moment、写入 momentId。
 * 之所以复制而不是抽公共函数：两条路由的校验对象与错误文案都不同，
 * 强行抽象会变成一堆 if，反而更难读。
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const momentId = parseInt(id)

    if (Number.isNaN(momentId) || momentId < 1) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 })
    }

    // 只允许看已发布动态的评论（草稿不泄露）
    const moment = await prisma.moment.findUnique({ where: { id: momentId } })
    if (!moment || !moment.published) {
      return NextResponse.json({ error: "动态不存在" }, { status: 404 })
    }

    const comments = await prisma.comment.findMany({
      where: { momentId },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    })

    // 组装嵌套树（与文章评论同一套规则）
    const map = new Map<number, any>()
    const roots: any[] = []
    comments.forEach((c) => map.set(c.id, { ...c, replies: [] }))
    comments.forEach((c) => {
      const mapped = map.get(c.id)!
      if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.replies.push(mapped)
      else roots.push(mapped)
    })

    return NextResponse.json(roots)
  } catch (error) {
    console.error("Get moment comments error:", error)
    return NextResponse.json({ error: "获取评论失败" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  // 与文章评论共用同一把限流键：同一个人每分钟最多 3 条（不分内容类型）
  const limitResult = rateLimit(`comment:${user.id}`, 3, 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "评论过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(limitResult.retryAfter) } }
    )
  }

  try {
    const { id } = await params
    const momentId = parseInt(id)

    const parsed = CommentSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "评论内容不合法" },
        { status: 400 }
      )
    }
    const { content, parentId } = parsed.data

    const moment = await prisma.moment.findUnique({ where: { id: momentId } })
    if (!moment || !moment.published) {
      return NextResponse.json({ error: "动态不存在" }, { status: 404 })
    }

    // 回复父评论时，必须属于同一条动态（防止跨内容串回复）
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } })
      if (!parent || parent.momentId !== momentId) {
        return NextResponse.json({ error: "回复的评论不存在" }, { status: 400 })
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        momentId,
        authorId: parseInt(user.id),
        parentId: parentId || null,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error("Create moment comment error:", error)
    return NextResponse.json({ error: "发表评论失败" }, { status: 500 })
  }
}
