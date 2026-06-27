import type { Metadata } from "next"
import ArticleForm from "../ArticleForm"

export const metadata: Metadata = {
  title: "新建文章 - 管理后台",
}

export default function NewArticlePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">新建文章</h1>
      <ArticleForm />
    </div>
  )
}
