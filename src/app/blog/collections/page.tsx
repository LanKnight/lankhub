import type { Metadata } from "next"
import { ViewTransition } from "react"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { staggerDelay } from "@/lib/motion"
import { FolderOpen, FileText } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "文章合集 - lankHub",
  description: "按主题浏览博客文章合集",
}

export default async function CollectionsPage() {
  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      coverImage: true,
      _count: {
        select: { articles: { where: { published: true } } },
      },
    },
  })

  // Only show collections with published articles
  const visible = collections.filter((c) => c._count.articles > 0)

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900">文章合集</h1>
          <p className="text-gray-500 mt-3">按主题浏览，发现更多精彩内容</p>
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg">暂无合集</p>
            <p className="text-sm mt-1">博主正在整理文章中...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((c, index) => (
              <Link
                key={c.id}
                href={`/blog/collections/${c.slug}`}
                className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 animate-rise-in"
                style={{ animationDelay: staggerDelay(index) }}
              >
                {/* 合集封面（可选） */}
                {c.coverImage ? (
                  <div className="relative h-32 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.coverImage}
                      alt={c.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : null}
                <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                    <FolderOpen size={20} className="text-gray-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 group-hover:text-accent transition-colors">
                    {c.name}
                  </h2>
                </div>
                {c.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                    {c.description}
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <FileText size={12} />
                  <span>
                    {c._count.articles} 篇文章
                  </span>
                </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ViewTransition>
  )
}
