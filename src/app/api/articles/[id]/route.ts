import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Try to find by ID first, then by slug
    const isNumeric = /^\d+$/.test(id)

    const article = await prisma.article.findFirst({
      where: isNumeric
        ? { id: parseInt(id), published: true }
        : { slug: id, published: true },
      include: {
        author: {
          select: { id: true, name: true, avatar: true, bio: true },
        },
      },
    })

    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 })
    }

    // 基于 cookie 的查看计数去重（同一浏览器 24h 内不重复计数）
    const cookieStore = await cookies()
    const viewedKey = `viewed_${article.id}`
    const alreadyViewed = cookieStore.get(viewedKey)

    if (!alreadyViewed) {
      await prisma.article.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
    }

    const response = NextResponse.json({
      ...article,
      viewCount: article.viewCount + (alreadyViewed ? 0 : 1),
    })

    if (!alreadyViewed) {
      response.cookies.set(viewedKey, "1", {
        maxAge: 86400, // 24 小时
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      })
    }

    return response
  } catch (error) {
    console.error("Get article error:", error)
    return NextResponse.json(
      { error: "获取文章失败" },
      { status: 500 }
    )
  }
}
