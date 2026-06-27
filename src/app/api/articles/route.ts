import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") || "1")
  const limit = parseInt(searchParams.get("limit") || "10")
  const skip = (page - 1) * limit

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { published: true },
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
    prisma.article.count({ where: { published: true } }),
  ])

  return NextResponse.json({
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
