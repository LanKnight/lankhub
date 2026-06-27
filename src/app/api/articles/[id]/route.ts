import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Increment view count
  await prisma.article.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
  })

  return NextResponse.json({
    ...article,
    viewCount: article.viewCount + 1,
  })
}
