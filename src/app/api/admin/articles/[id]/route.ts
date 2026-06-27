import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await req.json()
    const { title, summary, content, coverImage, published } = body

    const existing = await prisma.article.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 })
    }

    // Update slug if title changed
    let slug = existing.slug
    if (title && title !== existing.title) {
      slug = generateSlug(title)
      const duplicate = await prisma.article.findFirst({
        where: { slug, id: { not: parseInt(id) } },
      })
      if (duplicate) {
        slug = `${slug}-${Date.now()}`
      }
    }

    const article = await prisma.article.update({
      where: { id: parseInt(id) },
      data: {
        title: title ?? existing.title,
        slug,
        summary: summary ?? existing.summary,
        content: content ?? existing.content,
        coverImage: coverImage ?? existing.coverImage,
        published: published ?? existing.published,
      },
    })

    return NextResponse.json(article)
  } catch (error) {
    console.error("Update article error:", error)
    return NextResponse.json(
      { error: "更新文章失败" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params

    const existing = await prisma.article.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 })
    }

    await prisma.article.delete({
      where: { id: parseInt(id) },
    })

    return NextResponse.json({ message: "文章已删除" })
  } catch (error) {
    console.error("Delete article error:", error)
    return NextResponse.json(
      { error: "删除文章失败" },
      { status: 500 }
    )
  }
}
