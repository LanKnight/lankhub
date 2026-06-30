import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"

export async function GET(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { articles: true },
      },
    },
  })

  return NextResponse.json(collections)
}

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const body = await req.json()
    const { name, description, coverImage, sortOrder } = body

    if (!name) {
      return NextResponse.json(
        { error: "合集名称为必填项" },
        { status: 400 }
      )
    }

    let slug = generateSlug(name)
    const existing = await prisma.collection.findUnique({ where: { slug } })
    if (existing) {
      slug = `${slug}-${Date.now()}`
    }

    const collection = await prisma.collection.create({
      data: {
        name,
        slug,
        description: description || "",
        coverImage: coverImage || "",
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json(collection, { status: 201 })
  } catch (error) {
    console.error("Create collection error:", error)
    return NextResponse.json(
      { error: "创建合集失败" },
      { status: 500 }
    )
  }
}
