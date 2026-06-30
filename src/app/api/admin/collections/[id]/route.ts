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
    const { name, description, coverImage, sortOrder } = body

    const existing = await prisma.collection.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "合集不存在" }, { status: 404 })
    }

    let slug = existing.slug
    if (name && name !== existing.name) {
      slug = generateSlug(name)
      const duplicate = await prisma.collection.findFirst({
        where: { slug, id: { not: parseInt(id) } },
      })
      if (duplicate) {
        slug = `${slug}-${Date.now()}`
      }
    }

    const collection = await prisma.collection.update({
      where: { id: parseInt(id) },
      data: {
        name: name ?? existing.name,
        slug,
        description: description ?? existing.description,
        coverImage: coverImage ?? existing.coverImage,
        sortOrder: sortOrder ?? existing.sortOrder,
      },
    })

    return NextResponse.json(collection)
  } catch (error) {
    console.error("Update collection error:", error)
    return NextResponse.json(
      { error: "更新合集失败" },
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

    const existing = await prisma.collection.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "合集不存在" }, { status: 404 })
    }

    await prisma.collection.delete({
      where: { id: parseInt(id) },
    })

    return NextResponse.json({ message: "合集已删除" })
  } catch (error) {
    console.error("Delete collection error:", error)
    return NextResponse.json(
      { error: "删除合集失败" },
      { status: 500 }
    )
  }
}
