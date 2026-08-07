import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10") || 10))
    const skip = (page - 1) * limit

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: { published: true },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImage: true,
          pinned: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, avatar: true },
          },
        },
      }),
      prisma.article.count({ where: { published: true } }),
    ])

    return NextResponse.json({
      articles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error("Get articles error:", error)
    return NextResponse.json(
      { error: "获取文章列表失败" },
      { status: 500 }
    )
  }
}
