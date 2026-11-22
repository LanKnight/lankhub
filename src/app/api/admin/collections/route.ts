import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { getPublishTokenOwner } from "@/lib/publish-token"
import { generateSlug } from "@/lib/utils"
import { CollectionSchema } from "@/lib/validations"

export async function GET(req: NextRequest) {
  /*
   * 发布令牌可以**只读**这里：本地发布要把「合集名」换成 id。
   * 合集名与 id 本来就是公开页面（/blog/collections）上能看到的信息，
   * 所以按只读放开不扩大暴露面；新建/修改/删除合集仍然只认站长会话。
   */
  const authError = (await getPublishTokenOwner()) ? null : await requireOwner()
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
