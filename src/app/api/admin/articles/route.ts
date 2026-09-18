import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"
import { validationErrorResponse } from "@/lib/api-validation"
import {
  AdminArticleListSchema,
  ArticleCreateSchema,
  PublishRequirementSchema,
} from "@/lib/validations"

export async function GET(req: NextRequest) {
  const user = await requirePermission("article")
  if (user instanceof NextResponse) return user

  const { searchParams } = new URL(req.url)
  // ?page= 这类空值按「未提供」处理，交给 schema 的 default 兜底
  const readParam = (key: string) => searchParams.get(key)?.trim() || undefined

  const parsed = AdminArticleListSchema.safeParse({
    page: readParam("page"),
    limit: readParam("limit"),
  })
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { page, limit } = parsed.data
  const skip = (page - 1) * limit

  // 授权读者只能看到自己创建的文章（站长看全部）
  const where = user.role === "OWNER" ? {} : { authorId: parseInt(user.id) }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        author: {
          select: { id: true, name: true },
        },
        collection: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    }),
    prisma.article.count({ where }),
  ])

  return NextResponse.json({
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  const user = await requirePermission("article")
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "请求体不是合法的 JSON" },
        { status: 400 }
      )
    }

    const parsed = ArticleCreateSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { title, summary, content, coverImage, published, pinned, collectionId } =
      parsed.data
    const effectivePublished = published ?? false
    const effectiveCollectionId = collectionId ?? null

    // 发布前置条件：已发布的文章必须归属某个合集
    const publishCheck = PublishRequirementSchema.safeParse({
      published: effectivePublished,
      collectionId: effectiveCollectionId,
    })
    if (!publishCheck.success) return validationErrorResponse(publishCheck.error)

    // 合集必须真实存在。没有这层检查时，传入不存在的 id 会由 Prisma 抛外键错误 → 500
    if (effectiveCollectionId !== null) {
      const collection = await prisma.collection.findUnique({
        where: { id: effectiveCollectionId },
        select: { id: true },
      })
      if (!collection) {
        return NextResponse.json({ error: "所选合集不存在" }, { status: 400 })
      }
    }

    // Generate unique slug
    let slug = generateSlug(title)
    const existingArticle = await prisma.article.findUnique({
      where: { slug },
    })
    if (existingArticle) {
      slug = `${slug}-${Date.now()}`
    }

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        summary: summary || "",
        content,
        coverImage: coverImage || "",
        published: effectivePublished,
        pinned: pinned || false,
        // 记录创建者：授权读者创建的归属自己，站长创建的归属站长
        authorId: parseInt(user.id),
        collectionId: effectiveCollectionId,
      },
    })

    return NextResponse.json(article, { status: 201 })
  } catch (error) {
    console.error("Create article error:", error)
    return NextResponse.json(
      { error: "创建文章失败" },
      { status: 500 }
    )
  }
}
