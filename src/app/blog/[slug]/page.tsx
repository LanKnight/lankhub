import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ArticleContent from "@/components/blog/ArticleContent"
import CommentSection from "@/components/comment/CommentSection"
import { prisma } from "@/lib/prisma"
import { formatDate, estimateReadTime } from "@/lib/utils"

async function getArticle(slug: string) {
  const article = await prisma.article.findFirst({
    where: { slug, published: true },
    include: {
      author: {
        select: { id: true, name: true, avatar: true, bio: true },
      },
    },
  })

  if (!article) return null

  // Increment view count
  await prisma.article.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } },
  })

  return { ...article, viewCount: article.viewCount + 1 }
}

async function getComments(articleId: number) {
  const comments = await prisma.comment.findMany({
    where: { articleId },
    orderBy: { createdAt: "asc" },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  })

  // Build nested comment tree
  const commentMap = new Map<number, any>()
  const rootComments: any[] = []

  comments.forEach((comment) => {
    commentMap.set(comment.id, { ...comment, replies: [] })
  })

  comments.forEach((comment) => {
    const mapped = commentMap.get(comment.id)!
    if (comment.parentId && commentMap.has(comment.parentId)) {
      commentMap.get(comment.parentId)!.replies.push(mapped)
    } else {
      rootComments.push(mapped)
    }
  })

  return rootComments
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
      description: article.summary ?? undefined,
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
