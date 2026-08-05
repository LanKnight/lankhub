import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { isValidPhotoCategory } from "@/lib/photo-categories"

export async function GET(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  const photos = await prisma.photo.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json(photos)
}

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const body = await req.json()
    const { url, filename, category, title, description, width, height, sortOrder } = body

    if (!url || !filename) {
      return NextResponse.json(
        { error: "url 和 filename 为必填项" },
        { status: 400 }
      )
    }

    if (!url.startsWith("/api/images/")) {
      return NextResponse.json(
        { error: "无效的图片 URL" },
        { status: 400 }
      )
    }

    if (!category || !isValidPhotoCategory(category)) {
      return NextResponse.json(
        { error: "无效的照片分类" },
        { status: 400 }
      )
    }

    // Check for duplicate filename
    const existing = await prisma.photo.findUnique({ where: { filename } })
    if (existing) {
      return NextResponse.json(
        { error: "该照片已存在" },
        { status: 409 }
      )
    }

    const photo = await prisma.photo.create({
      data: {
        url,
        filename,
        category,
        title: title || null,
        description: description || null,
        width: width || null,
        height: height || null,
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json(photo, { status: 201 })
  } catch (error) {
    console.error("Create photo error:", error)
    return NextResponse.json(
      { error: "添加照片失败" },
      { status: 500 }
    )
  }
}
