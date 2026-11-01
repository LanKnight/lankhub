import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

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

    /*
     * 浏览量自增是**未认证的写操作**（清掉 cookie 就能再来一次），
     * 而本项目 SQLite 只有一个写者 —— 少量并发就能让评论/上传/后台操作排队。
     * 所以这里单独给"写"这一侧加限流：超限只是不计数，**不影响正文返回**。
     */
    let counted = false
    if (!alreadyViewed) {
      const ip = getClientIp(req.headers)
      if (rateLimit(`article-view:${ip}`, 30, 60_000).allowed) {
        await prisma.article.update({
          where: { id: article.id },
          data: { viewCount: { increment: 1 } },
        })
        counted = true
      }
    }

    const response = NextResponse.json({
      ...article,
      viewCount: article.viewCount + (counted ? 1 : 0),
    })

    if (counted) {
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
