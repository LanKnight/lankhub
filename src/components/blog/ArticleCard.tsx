import Link from "next/link"
import { Calendar, Eye } from "lucide-react"

interface ArticleCardProps {
  title: string
  slug: string
  summary?: string | null
  coverImage?: string | null
  viewCount: number
  createdAt: string
  author: {
    name: string
  }
}

export default function ArticleCard({
  title,
  slug,
  summary,
  viewCount,
  createdAt,
  author,
}: ArticleCardProps) {
  return (
    <Link
      href={`/blog/${slug}`}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <article className="p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 group-hover:text-accent transition-colors line-clamp-2">
          {title}
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
    </Link>
  )
}
