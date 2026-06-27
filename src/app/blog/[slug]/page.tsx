import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ArticleContent from "@/components/blog/ArticleContent"
import CommentSection from "@/components/comment/CommentSection"
import { formatDate, estimateReadTime } from "@/lib/utils"

async function getArticle(slug: string) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const res = await fetch(`${baseUrl}/api/articles/${slug}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function getComments(articleId: number) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const res = await fetch(
      `${baseUrl}/api/articles/${articleId}/comments`,
      { cache: "no-store" }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) return { title: "文章不存在" }

  return {
    title: article.title,
    description: article.summary || article.title,
    openGraph: {
      title: article.title,
      description: article.summary,
      type: "article",
    },
  }
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getArticle(slug)

  if (!article) {
    notFound()
  }

  const comments = await getComments(article.id)
  const readTime = estimateReadTime(article.content)

  return (
    <article className="max-w-3xl mx-auto px-4 py-16">
      {/* Header */}
      <header className="mb-10 space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
          {article.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="font-medium text-gray-700">
            {article.author.name}
          </span>
          <span>{formatDate(article.createdAt)}</span>
          <span>·</span>
          <span>{readTime} 分钟阅读</span>
          <span>·</span>
          <span>{article.viewCount} 次阅读</span>
        </div>
        {article.summary && (
          <p className="text-lg text-gray-500 italic border-l-4 border-accent pl-4">
            {article.summary}
          </p>
        )}
      </header>

      {/* Content */}
      <div className="prose-custom">
        <ArticleContent content={article.content} />
      </div>

      {/* Divider */}
      <hr className="my-12 border-gray-200" />

      {/* Comments */}
      <CommentSection articleId={article.id} initialComments={comments} />
    </article>
  )
}
