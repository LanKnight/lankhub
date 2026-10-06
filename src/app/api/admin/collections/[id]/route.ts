import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"
import { IdSchema, CollectionUpdateSchema } from "@/lib/validations"
import {
  ensureUncategorizedCollection,
  isUncategorizedCollection,
} from "@/lib/collections"

/** 解析并校验路径参数里的合集 ID（非法时返回 400 而不是让 NaN 流到 Prisma 变 500） */
async function readCollectionId(params: Promise<{ id: string }>) {
  const parsed = IdSchema.safeParse((await params).id)
  if (!parsed.success) {
    return NextResponse.json({ error: "合集 ID 不合法" }, { status: 400 })
  }
  return parsed.data
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  const id = await readCollectionId(params)
  if (id instanceof NextResponse) return id

  try {
    // PUT 是局部更新语义，所以用 CollectionUpdateSchema（= CollectionSchema.partial()）：
    // 未传的字段保持原值，不能因为缺 name 就把只改描述的请求打回
    const parsed = CollectionUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }
    const { name, description, coverImage, sortOrder } = parsed.data

    const existing = await prisma.collection.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: "合集不存在" }, { status: 404 })
    }

    let slug = existing.slug
    if (name && name !== existing.name) {
      slug = generateSlug(name)
      const duplicate = await prisma.collection.findFirst({
        where: { slug, id: { not: id } },
      })
      if (duplicate) {
        slug = `${slug}-${Date.now()}`
      }
    }

    const collection = await prisma.collection.update({
      where: { id },
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

  const id = await readCollectionId(params)
  if (id instanceof NextResponse) return id

  try {
    const existing = await prisma.collection.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: "合集不存在" }, { status: 404 })
    }

    // 兜底合集不能删：它是被删合集里文章的去处，删掉会让这批文章无处可归
    if (isUncategorizedCollection(existing)) {
      return NextResponse.json(
        { error: "「未分类」是兜底合集，不能删除" },
        { status: 400 }
      )
    }

    // 合集外键是 onDelete: SetNull —— 直接删会让下面的文章（含已发布）
    // 静默变成「无合集」，破坏"已发布必有合集"的约定，所以先迁移再删除
    const articleCount = await prisma.article.count({
      where: { collectionId: id },
    })

    // 在事务外创建兜底合集：Prisma 的 $transaction 里再用外部 client
    // 会造成嵌套连接，SQLite 下容易死锁
    const fallback =
      articleCount > 0 ? await ensureUncategorizedCollection(prisma) : null

    await prisma.$transaction(async (tx) => {
      if (fallback) {
        await tx.article.updateMany({
          where: { collectionId: id },
          data: { collectionId: fallback.id },
        })
      }
      await tx.collection.delete({ where: { id } })
    })

    return NextResponse.json({
      message: "合集已删除",
      migratedArticles: articleCount,
      fallbackCollection: fallback
        ? { id: fallback.id, name: fallback.name }
        : null,
    })
  } catch (error) {
    console.error("Delete collection error:", error)
    return NextResponse.json(
      { error: "删除合集失败" },
      { status: 500 }
    )
  }
}
