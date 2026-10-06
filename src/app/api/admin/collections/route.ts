import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"
import { CollectionSchema } from "@/lib/validations"

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
    // 校验交给 CollectionSchema（原先只判了个 !name）
    const parsed = CollectionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }
    const { name, description, coverImage, sortOrder } = parsed.data

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
