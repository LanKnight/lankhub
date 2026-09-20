import type { Metadata } from "next"
import { Suspense, ViewTransition } from "react"
import ArticleCard from "@/components/blog/ArticleCard"
import Pagination from "@/components/blog/Pagination"
import BlogSearch from "@/components/blog/BlogSearch"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "博客",
  description: "阅读最新文章，探索技术与生活。",
}

async function getArticles(page: number, q?: string) {
  const limit = 10
  const skip = (page - 1) * limit

  // 搜索：标题/摘要模糊匹配（SQLite LIKE，中文直接匹配）
  const where = q
    ? {
        published: true,
        OR: [
          { title: { contains: q } },
          { summary: { contains: q } },
        ],
      }
    : { published: true }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        coverImage: true,
        pinned: true,
        viewCount: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, avatar: true },
        },
        collection: {
          select: { name: true, slug: true },
        },
      },
    }),
    prisma.article.count({ where }),
  ])

  return {
    articles,
    total,
    totalPages: Math.ceil(total / limit),
  }
}

export default async function BlogListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page || "1")
  // 搜索词限制 60 字符（防超长查询）；% 和 _ 是 SQL LIKE 通配符，
  // 保留其字面搜索语义（Prisma 参数化查询，无注入风险）
  const rawQ = params.q?.trim() || undefined
  const q = rawQ ? rawQ.slice(0, 60) : undefined
  const data = await getArticles(page, q)

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900">博客</h1>
          <p className="text-gray-500 mt-3">分享技术心得与生活感悟</p>
        </div>

        <Suspense>
          <BlogSearch />
        </Suspense>

        {q && (
          <p className="text-center text-sm text-gray-500 mb-6">
            搜索“{q}”，找到 {data.total} 篇相关文章
            {data.total > 0 && (
              <a
                href="/blog"
                className="ml-2 text-accent hover:underline"
              >
                清除搜索
              </a>
            )}
          </p>
        )}

        {data.articles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">{q ? "没有找到相关文章" : "暂无文章"}</p>
            <p className="text-sm mt-2">
              {q ? "换个关键词试试，或浏览全部文章" : "敬请期待..."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {data.articles.map((article: any, index: number) => (
              <ArticleCard
                key={article.id}
                title={article.title}
                slug={article.slug}
                summary={article.summary}
                coverImage={article.coverImage}
                viewCount={article.viewCount}
                createdAt={formatDate(article.createdAt)}
                pinned={article.pinned}
                author={article.author}
                collection={article.collection}
                index={index}
              />
            ))}
          </div>
        )}

        {/* 搜索时也显示分页，页码携带 q 关键词 */}
        <Pagination
          currentPage={page}
          totalPages={data.totalPages}
          baseUrl={q ? `/blog?q=${encodeURIComponent(q)}` : "/blog"}
        />
      </div>
    </ViewTransition>
  )
}
