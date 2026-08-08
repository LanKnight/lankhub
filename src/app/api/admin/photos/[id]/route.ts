import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { isValidPhotoCategory } from "@/lib/photo-categories"
import { unlink } from "fs/promises"
import path from "path"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await req.json()
    const { category, title, description, sortOrder } = body

    const existing = await prisma.photo.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "照片不存在" }, { status: 404 })
    }

    if (category && !isValidPhotoCategory(category)) {
      return NextResponse.json(
        { error: "无效的照片分类" },
        { status: 400 }
      )
    }

    const photo = await prisma.photo.update({
      where: { id: parseInt(id) },
      data: {
        category: category ?? existing.category,
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        sortOrder: sortOrder ?? existing.sortOrder,
      },
    })

    return NextResponse.json(photo)
  } catch (error) {
    console.error("Update photo error:", error)
    return NextResponse.json(
      { error: "更新照片失败" },
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

    const existing = await prisma.photo.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "照片不存在" }, { status: 404 })
    }

    // Delete from database
    await prisma.photo.delete({
      where: { id: parseInt(id) },
    })

    // Delete file from disk (tolerant of missing file)
    try {
      // 安全校验：拒绝路径穿越
      if (existing.filename.includes("..") || existing.filename.includes("/") || existing.filename.includes("\\")) {
        console.error("[photos delete] unsafe filename:", existing.filename)
      } else {
        const filePath = path.join(process.cwd(), "data", "uploads", "images", existing.filename)
        await unlink(filePath)
      }
    } catch {
      // File may already be gone — that's fine
    }

    return NextResponse.json({ message: "照片已删除" })
  } catch (error) {
    console.error("Delete photo error:", error)
    return NextResponse.json(
      { error: "删除照片失败" },
      { status: 500 }
    )
  }
}
