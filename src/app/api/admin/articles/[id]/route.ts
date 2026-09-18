import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/auth-helpers"
import { generateSlug } from "@/lib/utils"
import { validationErrorResponse } from "@/lib/api-validation"
import {
  ArticleUpdateSchema,
  IdSchema,
  PublishRequirementSchema,
} from "@/lib/validations"

/** 校验操作权限：OWNER 全权；授权读者仅能操作自己创建的文章 */
async function checkArticleAccess(articleId: number) {
  const user = await requirePermission("article")
  if (user instanceof NextResponse) return user

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
  })
  if (!existing) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 })
  }

  if (user.role !== "OWNER" && existing.authorId !== parseInt(user.id)) {
    return NextResponse.json(
      { error: "只能操作自己创建的文章" },
      { status: 403 }
    )
  }
  return { user, existing }
}

/** 解析并校验路径参数里的文章 ID（非法时返回 400 而不是让 NaN 流到 Prisma 变 500） */
async function readArticleId(params: Promise<{ id: string }>) {
  const parsed = IdSchema.safeParse((await params).id)
  if (!parsed.success) {
    return NextResponse.json({ error: "文章 ID 不合法" }, { status: 400 })
  }
  return parsed.data
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await readArticleId(params)
  if (id instanceof NextResponse) return id

  const access = await checkArticleAccess(id)
  if (access instanceof NextResponse) return access
  const { existing } = access

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "请求体不是合法的 JSON" },
        { status: 400 }
      )
    }

    const parsed = ArticleUpdateSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { title, summary, content, coverImage, published, pinned, collectionId } =
      parsed.data

    // 生效值 = 请求体与库中现有值合并后的结果。
    // 发布前置条件必须作用在生效值上，否则「只改标题」这类局部更新会绕过规则
    const effectivePublished = published ?? existing.published
    const effectiveCollectionId =
      collectionId !== undefined ? collectionId : existing.collectionId

    const publishCheck = PublishRequirementSchema.safeParse({
      published: effectivePublished,
      collectionId: effectiveCollectionId,
    })
    if (!publishCheck.success) return validationErrorResponse(publishCheck.error)

    if (collectionId !== undefined && collectionId !== null) {
      const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: { id: true },
      })
      if (!collection) {
        return NextResponse.json({ error: "所选合集不存在" }, { status: 400 })
      }
    }

    // Update slug if title changed
    let slug = existing.slug
    if (title && title !== existing.title) {
      slug = generateSlug(title)
      const duplicate = await prisma.article.findFirst({
        where: { slug, id: { not: id } },
      })
      if (duplicate) {
        slug = `${slug}-${Date.now()}`
      }
    }

    const article = await prisma.article.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        slug,
        summary: summary ?? existing.summary,
        content: content ?? existing.content,
        coverImage: coverImage ?? existing.coverImage,
        published: effectivePublished,
        pinned: pinned ?? existing.pinned,
        collectionId: effectiveCollectionId,
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
  const id = await readArticleId(params)
  if (id instanceof NextResponse) return id

  const access = await checkArticleAccess(id)
  if (access instanceof NextResponse) return access
  const { existing } = access

  try {
    await prisma.article.delete({
      where: { id: existing.id },
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
