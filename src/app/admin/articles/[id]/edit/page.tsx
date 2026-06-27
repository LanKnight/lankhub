import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import ArticleForm from "../../ArticleForm"

export const metadata: Metadata = {
  title: "编辑文章 - 管理后台",
}

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const article = await prisma.article.findUnique({
    where: { id: parseInt(id) },
  })

  if (!article) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">编辑文章</h1>
      <ArticleForm
        initialData={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          summary: article.summary || "",
          content: article.content,
          published: article.published,
        }}
      />
    </div>
  )
}
