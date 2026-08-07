import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const collection = await prisma.collection.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { articles: { where: { published: true } } },
        },
      },
    })

    if (!collection) {
      return NextResponse.json({ error: "合集不存在" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10") || 10))
    const skip = (page - 1) * limit

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          collectionId: collection.id,
          published: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImage: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, avatar: true },
          },
        },
      }),
      prisma.article.count({
        where: {
          collectionId: collection.id,
          published: true,
        },
      }),
    ])

    return NextResponse.json({
      collection: {
        ...collection,
        articleCount: collection._count.articles,
      },
      articles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error("Get collection error:", error)
    return NextResponse.json(
      { error: "获取合集失败" },
      { status: 500 }
    )
  }
}
