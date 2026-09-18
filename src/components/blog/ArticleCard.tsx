import Link from "next/link"
import Image from "next/image"
import { Calendar, Eye, FolderOpen, Pin } from "lucide-react"

interface ArticleCardProps {
  title: string
  slug: string
  summary?: string | null
  coverImage?: string | null
  viewCount: number
  createdAt: string
  pinned?: boolean
  author: {
    name: string
  }
  /** 所属合集。为空时不渲染标签（兼容存量数据，以及合集被删的情况） */
  collection?: {
    name: string
    slug: string
  } | null
}

export default function ArticleCard({
  title,
  slug,
  summary,
  coverImage,
  viewCount,
  createdAt,
  pinned,
  author,
  collection,
}: ArticleCardProps) {
  return (
    /*
     * 外壳刻意不是 <Link>：合集标签需要另一个链接，
     * 而 <a> 里嵌 <a> 是无效 HTML（浏览器会拆开 DOM）。
     * 改用 stretched link —— 标题链接的伪元素铺满整张卡，
     * 既保留「整卡可点」，又让合集标签能独立点击。
     */
    <div className="group relative block bg-white border border-gray-200 shadow-sm overflow-hidden hover:border-gray-400 hover:shadow-md transition-all duration-200">
      {/* 封面图（有图时展示，3:1 横幅） */}
      {coverImage && (
        <div className="relative aspect-[3/1] bg-gray-100 overflow-hidden">
          <Image
            src={coverImage}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 896px) 100vw, 896px"
          />
        </div>
      )}

      <article className="p-6 space-y-4">
        {collection && (
          <Link
            href={`/blog/collections/${collection.slug}`}
            // z-10：浮在标题链接铺开的伪元素之上，保证自己可点
            className="relative z-10 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors"
          >
            <FolderOpen size={12} />
            {collection.name}
          </Link>
        )}

        <h2 className="text-xl font-bold text-gray-900 group-hover:text-accent transition-colors line-clamp-2">
          {pinned && (
            <span className="inline-flex items-center mr-1.5 text-amber-500 align-middle">
              <Pin size={16} className="fill-amber-500" />
            </span>
          )}
          <Link href={`/blog/${slug}`} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h2>
        {summary && (
          <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
            {summary}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="font-medium text-gray-600">{author.name}</span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {createdAt}
          </span>
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {viewCount}
          </span>
        </div>
      </article>
    </div>
  )
}
