import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import ArticleCard from "@/components/blog/ArticleCard"
import Pagination from "@/components/blog/Pagination"
import { formatDate } from "@/lib/utils"
import { ChevronLeft } from "lucide-react"

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = await prisma.collection.findUnique({ where: { slug } })

  if (!collection) {
    return { title: "合集不存在 - lankHub" }
  }

  return {
    title: `${collection.name} - lankHub`,
    description: collection.description || `浏览合集"${collection.name}"中的所有文章`,
  }
}

export default async function CollectionDetailPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { page: pageStr } = await searchParams
  const page = parseInt(pageStr || "1")
  const limit = 10
  const skip = (page - 1) * limit

  const collection = await prisma.collection.findUnique({
    where: { slug },
  })

  if (!collection) {
    notFound()
  }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: {
        collectionId: collection.id,
        published: true,
      },
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
    prisma.article.count({
      where: {
        collectionId: collection.id,
        published: true,
      },
    }),
  ])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <Link
        href="/blog/collections"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-accent transition-colors mb-8"
      >
        <ChevronLeft size={16} />
        返回合集列表
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">{collection.name}</h1>
        {collection.description && (
          <p className="text-gray-500 mt-2">{collection.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-1">共 {total} 篇文章</p>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">该合集中暂无文章</p>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {articles.map((article) => (
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
          <div className="mt-10">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseUrl={`/blog/collections/${slug}`}
            />
          </div>
        </>
      )}
    </div>
  )
}
