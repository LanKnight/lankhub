import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PaginationSchema } from "@/lib/validations"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // 分页参数交给 PaginationSchema：它用 .catch 保留原有的宽松回退
    // （脏查询串回退到默认值，而不是变成 400），limit 越界则夹取到 1–50
    const parsed = PaginationSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })
    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 10 }
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
