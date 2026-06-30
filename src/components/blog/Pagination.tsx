import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  currentPage: number
  totalPages: number
  baseUrl?: string
}

export default function Pagination({
  currentPage,
  totalPages,
  baseUrl = "/blog",
}: PaginationProps) {
  if (totalPages <= 1) return null

  const buildHref = (page: number) => {
    if (page === 1) return baseUrl
    const sep = baseUrl.includes("?") ? "&" : "?"
    return `${baseUrl}${sep}page=${page}`
  }

  return (
    <div className="flex items-center justify-center gap-2 pt-8">
      {currentPage > 1 && (
        <Link
          href={buildHref(currentPage - 1)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft size={16} />
          上一页
        </Link>
      )}

      <div className="flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <Link
            key={page}
            href={buildHref(page)}
            className={`w-9 h-9 flex items-center justify-center text-sm transition-colors ${
              page === currentPage
                ? "bg-gray-900 text-paper"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {page}
          </Link>
        ))}
      </div>

      {currentPage < totalPages && (
        <Link
          href={buildHref(currentPage + 1)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          下一页
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  )
}
