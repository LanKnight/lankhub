import type { Metadata } from "next"
import { ViewTransition } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { FolderOpen } from "lucide-react"
import ArticleContent from "@/components/blog/ArticleContent"
import BackLink from "@/components/ui/BackLink"
import ArticleViewTracker from "@/components/blog/ArticleViewTracker"
import ReadingProgress from "@/components/blog/ReadingProgress"
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
      collection: {
        select: { name: true, slug: true },
      },
    },
  })

  if (!article) return null

  // 浏览量计数已迁移到客户端：挂载后由 /api/articles/[id] 计数并写去重 cookie
  return article
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
    <ViewTransition enter="auto" exit="auto" default="none">
      <ReadingProgress />
      <article className="max-w-3xl mx-auto px-4 py-16">
        <BackLink fallbackHref="/blog" className="mb-8" />

        {/* Header */}
        <header className="mb-10 space-y-4">
          {article.collection && (
            <Link
              href={`/blog/collections/${article.collection.slug}`}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors"
            >
              <FolderOpen size={13} />
              {article.collection.name}
            </Link>
          )}
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
            <ArticleViewTracker
              articleId={article.id}
              initialViewCount={article.viewCount}
            />
          </div>
          {article.summary && (
            <p className="text-lg text-gray-500 italic border-l-4 border-accent pl-4">
              {article.summary}
            </p>
          )}
          {/* 作者简介（可选） */}
          {article.author.bio && (
            <p className="text-sm text-gray-400 mt-4">
              👤 {article.author.name}：{article.author.bio}
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
    </ViewTransition>
  )
}
