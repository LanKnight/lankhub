import Link from "next/link"
import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { PHOTO_CATEGORIES, HOBBY_ICONS } from "@/lib/photo-categories"

export const metadata: Metadata = {
  title: "生活相册 | lankHub",
}

export default async function PhotosPage() {
  // Get photo counts per category
  const counts = await prisma.photo.groupBy({
    by: ["category"],
    _count: { id: true },
  })
  const countMap = new Map(
    counts.map((c) => [c.category, c._count.id])
  )

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-3xl font-bold text-gray-900">生活相册</h1>
          <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
          <p className="text-gray-500 mt-4">记录生活中的每一个瞬间</p>
        </div>

        {/* Category grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PHOTO_CATEGORIES.map((cat) => {
            const Icon = HOBBY_ICONS[cat.slug]
            const count = countMap.get(cat.slug) || 0
            return (
              <Link
                key={cat.slug}
                href={`/photos/${cat.slug}`}
                className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 group"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gray-100 group-hover:scale-110 transition-transform">
                  <Icon size={28} className={cat.color} />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {cat.label}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {count} 张照片
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
