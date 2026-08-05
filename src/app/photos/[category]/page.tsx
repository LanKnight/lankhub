import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import {
  getPhotoCategory,
  isValidPhotoCategory,
  HOBBY_ICONS,
} from "@/lib/photo-categories"
import PhotoGrid from "./PhotoGrid"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

interface Props {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params
  const cat = getPhotoCategory(category)
  if (!cat) return { title: "未找到" }
  return {
    title: `${cat.label} - 生活相册 | lankHub`,
  }
}

export default async function PhotoCategoryPage({ params }: Props) {
  const { category } = await params

  if (!isValidPhotoCategory(category)) {
    notFound()
  }

  const cat = getPhotoCategory(category)!
  const Icon = HOBBY_ICONS[cat.slug]

  const photos = await prisma.photo.findMany({
    where: { category: cat.slug },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      width: true,
      height: true,
    },
  })

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link
          href="/photos"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-8"
        >
          <ChevronLeft size={16} />
          返回相册总览
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
            <Icon size={32} className={cat.color} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{cat.label}</h1>
          <p className="text-gray-500 mt-2">{cat.description}</p>
          <p className="text-sm text-gray-400 mt-2">共 {photos.length} 张照片</p>
        </div>

        {/* Photos */}
        {photos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">📸 这个分类还没有照片</p>
            <p className="text-sm mt-2">敬请期待</p>
          </div>
        ) : (
          <PhotoGrid photos={photos} categoryLabel={cat.label} />
        )}
      </div>
    </div>
  )
}
