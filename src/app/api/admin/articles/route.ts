import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"

export async function GET(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") || "1")
  const limit = parseInt(searchParams.get("limit") || "20")
  const skip = (page - 1) * limit

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: {
          select: { id: true, name: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    }),
    prisma.article.count(),
  ])

  return NextResponse.json({
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const body = await req.json()
    const { title, summary, content, coverImage, published, collectionId } = body

    if (!title || !content) {
      return NextResponse.json(
        { error: "标题和内容为必填项" },
        { status: 400 }
      )
    }

    // Generate unique slug
    let slug = generateSlug(title)
    const existingArticle = await prisma.article.findUnique({
      where: { slug },
    })
    if (existingArticle) {
      slug = `${slug}-${Date.now()}`
    }

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        summary: summary || "",
        content,
        coverImage: coverImage || "",
        published: published || false,
        authorId: (await getOwnerId())!,
        collectionId: collectionId || null,
      },
    })

    return NextResponse.json(article, { status: 201 })
  } catch (error) {
    console.error("Create article error:", error)
    return NextResponse.json(
      { error: "创建文章失败" },
      { status: 500 }
    )
  }
}

async function getOwnerId(): Promise<number | null> {
  const owner = await prisma.user.findFirst({
    where: { role: "OWNER" },
  })
  return owner?.id ?? null
}
