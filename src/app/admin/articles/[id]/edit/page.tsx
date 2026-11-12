import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import { userHasPermission } from "@/lib/permissions"
import { pagedHref } from "@/lib/utils"
import BackLink from "@/components/ui/BackLink"
import ArticleForm from "../../ArticleForm"

export const metadata: Metadata = {
  title: "编辑文章 - 管理后台",
}

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { id } = await params
  const search = await searchParams
  const page = Math.max(1, parseInt(search.page || "1") || 1)
  // 保存后回到来的那一页，而不是固定跳第 1 页
  const returnTo = pagedHref("/admin/articles", page)

  const [article, collections] = await Promise.all([
    prisma.article.findUnique({
      where: { id: parseInt(id) },
    }),
    prisma.collection.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!article) {
    notFound()
  }

  // 越权防护：授权读者只能编辑自己创建的文章（返回 404 避免泄露他人内容）
  const user = await getCurrentUser()
  // 没有「文章管理」权限的人根本不该进这个模块（站长恒有）
  if (!userHasPermission(user, "article")) redirect("/admin")
  if (user?.role !== "OWNER" && article.authorId !== parseInt(user?.id || "0")) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <BackLink fallbackHref={returnTo} />
      <h1 className="text-2xl font-bold text-gray-900">编辑文章</h1>
      <ArticleForm
        initialData={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          summary: article.summary || "",
          content: article.content,
          coverImage: article.coverImage,
          published: article.published,
          pinned: article.pinned,
          collectionId: article.collectionId,
        }}
        collections={collections}
        returnTo={returnTo}
      />
    </div>
  )
}
