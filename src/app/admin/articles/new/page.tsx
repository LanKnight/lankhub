import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import ArticleForm from "../ArticleForm"

export const metadata: Metadata = {
  title: "新建文章 - 管理后台",
}

export default async function NewArticlePage() {
  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">新建文章</h1>
      <ArticleForm collections={collections} />
    </div>
  )
}
