import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  currentPage: number
  totalPages: number
}

export default function Pagination({
  currentPage,
  totalPages,
}: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 pt-8">
      {currentPage > 1 && (
        <Link
          href={currentPage === 2 ? "/blog" : `/blog?page=${currentPage - 1}`}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-accent transition-colors"
        >
          <ChevronLeft size={16} />
          上一页
        </Link>
      )}

      <div className="flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <Link
            key={page}
            href={page === 1 ? "/blog" : `/blog?page=${page}`}
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm transition-colors ${
              page === currentPage
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {page}
          </Link>
        ))}
      </div>

      {currentPage < totalPages && (
        <Link
          href={`/blog?page=${currentPage + 1}`}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-accent transition-colors"
        >
          下一页
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  )
}
