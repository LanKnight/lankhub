import Link from "next/link"
import { ScrollText } from "lucide-react"
import { PHOTO_CATEGORIES, HOBBY_ICONS } from "@/lib/photo-categories"
import { staggerDelay } from "@/lib/motion"

export default function HobbiesSection() {
  return (
    <section className="py-24 px-4 bg-gray-50/50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">兴趣爱好</h2>
          <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 sm:gap-5">
          {PHOTO_CATEGORIES.map((category, index) => {
            const Icon = HOBBY_ICONS[category.slug]
            return (
              <Link
                key={category.slug}
                href={`/photos/${category.slug}`}
                className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group animate-rise-in"
                style={{ animationDelay: staggerDelay(index, 60) }}
              >
                <Icon
                  size={28}
                  className={`${category.color} group-hover:scale-110 transition-transform`}
                />
                <span className="text-sm font-medium text-gray-600">
                  {category.label}
                </span>
              </Link>
            )
          })}

          {/* 拾章：诗词收藏（与六栏目同一行） */}
          <Link
            href="/poems"
            className="flex flex-col items-center gap-2.5 p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group animate-rise-in"
            style={{ animationDelay: staggerDelay(PHOTO_CATEGORIES.length, 60) }}
          >
            <ScrollText
              size={28}
              className="text-red-400 group-hover:scale-110 transition-transform"
            />
            <span className="text-sm font-medium text-gray-600">拾章</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
