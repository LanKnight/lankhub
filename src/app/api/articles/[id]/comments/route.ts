import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const articleId = parseInt(id)

    // 校验 id 参数
    if (isNaN(articleId) || articleId < 1) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 })
    }

    // 确保文章存在且已发布（防止草稿评论泄露）
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    })
    if (!article || !article.published) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 })
    }

    const comments = await prisma.comment.findMany({
      where: { articleId },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    // Build nested comment tree
    const commentMap = new Map<number, any>()
    const rootComments: any[] = []

    comments.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, replies: [] })
    })

    comments.forEach((comment) => {
      const mapped = commentMap.get(comment.id)!
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId)!.replies.push(mapped)
      } else {
        rootComments.push(mapped)
      }
    })

    return NextResponse.json(rootComments)
  } catch (error) {
    console.error("Get comments error:", error)
    return NextResponse.json(
      { error: "获取评论失败" },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  // 频率限制：每个用户每分钟最多 3 条评论
  const ip = getClientIp(req)
  const limitResult = rateLimit(`comment:${user.id}`, 3, 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "评论过于频繁，请稍后再试" },
      {
        status: 429,
        headers: { "Retry-After": String(limitResult.retryAfter) },
      }
    )
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { content, parentId } = body

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "评论内容不能为空" },
        { status: 400 }
      )
    }

    // 限制评论最大长度 5000 字符
    if (content.trim().length > 5000) {
      return NextResponse.json(
        { error: "评论内容过长，最多 5000 字" },
        { status: 400 }
      )
    }

    // Check if article exists and is published
    const article = await prisma.article.findUnique({
      where: { id: parseInt(id) },
    })

    if (!article || !article.published) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 })
    }

    // If parentId is provided, verify parent comment exists and belongs to same article
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      })
      if (
        !parentComment ||
        parentComment.articleId !== parseInt(id)
      ) {
        return NextResponse.json(
          { error: "回复的评论不存在" },
          { status: 400 }
        )
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        articleId: parseInt(id),
        authorId: parseInt(user.id),
        parentId: parentId || null,
      },
      include: {
        author: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error("Create comment error:", error)
    return NextResponse.json(
      { error: "发表评论失败" },
      { status: 500 }
    )
  }
}
