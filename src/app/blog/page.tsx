import type { Metadata } from "next"
import ArticleCard from "@/components/blog/ArticleCard"
import Pagination from "@/components/blog/Pagination"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "博客",
  description: "阅读最新文章，探索技术与生活。",
}

async function getArticles(page: number) {
  const limit = 10
  const skip = (page - 1) * limit

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        coverImage: true,
        viewCount: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, avatar: true },
        },
      },
    }),
    prisma.article.count({ where: { published: true } }),
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
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page || "1")
  const data = await getArticles(page)

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900">博客</h1>
        <p className="text-gray-500 mt-3">分享技术心得与生活感悟</p>
      </div>

      {data.articles.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">暂无文章</p>
          <p className="text-sm mt-2">敬请期待...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {data.articles.map((article: any) => (
            <ArticleCard
              key={article.id}
              title={article.title}
              slug={article.slug}
              summary={article.summary}
              coverImage={article.coverImage}
              viewCount={article.viewCount}
              createdAt={formatDate(article.createdAt)}
              author={article.author}
            />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={data.totalPages} />
    </div>
  )
}
