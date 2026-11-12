import type { Metadata } from "next"
import Link from "next/link"
import { ViewTransition } from "react"

import BlogHeader from "@/components/blog/BlogHeader"
import MomentCard from "@/components/blog/MomentCard"
import { prisma } from "@/lib/prisma"
import { PHOTO_CATEGORIES, getPhotoCategory } from "@/lib/photo-categories"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "动态 - lankHub",
  description: "生活碎片：照片、见闻与随手记录",
}

/**
 * 动态（朋友圈式信息流）。
 *
 * ## 当前阶段（P2）
 * 这里是**只读**的：直接读旧「相册」表（Photo），一条照片当一条动态，
 * 主题 = 相册分类（码砚/弈趣/…），标题与描述沿用原来的字段。
 * 目的是先把三栏结构与卡片样式立起来。
 *
 * ## 下一步（P3）
 * 会新建 Moment / MomentImage 两张表并把相册数据迁过去，
 * 那时这个页面只换数据源，卡片组件（MomentCard）不用改。
 */
export default async function MomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>
}) {
  const params = await searchParams
  const topic =
    typeof params.topic === "string" && params.topic.length > 0 ? params.topic : undefined

  const [photos, grouped] = await Promise.all([
    prisma.photo.findMany({
      where: topic ? { category: topic } : undefined,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        url: true,
        width: true,
        height: true,
        title: true,
        description: true,
        category: true,
        createdAt: true,
      },
    }),
    prisma.photo.groupBy({
      by: ["category"],
      _count: { _all: true },
    }),
  ])

  // 只列「真的有照片」的主题，顺序按 PHOTO_CATEGORIES 的固定顺序
  const counts = new Map(grouped.map((g) => [g.category, g._count._all]))
  const topics = PHOTO_CATEGORIES.filter((c) => counts.has(c.slug))

  const chip = (href: string, label: string, isActive: boolean, count?: number) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={isActive ? "ml-1.5 text-gray-300" : "ml-1.5 text-gray-400"}>
          {count}
        </span>
      )}
    </Link>
  )

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <BlogHeader active="moments" />

        {topics.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            {chip("/blog/moments", "全部", !topic, photos.length)}
            {topics.map((c) =>
              chip(
                `/blog/moments?topic=${c.slug}`,
                c.label,
                topic === c.slug,
                counts.get(c.slug)
              )
            )}
          </div>
        )}

        {photos.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="text-lg">这里还没有内容</p>
            <p className="mt-2 text-sm">照片和随手记会陆续放到这里</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {photos.map((photo) => {
              const category = getPhotoCategory(photo.category)
              return (
                <MomentCard
                  key={photo.id}
                  topic={category?.label ?? photo.category}
                  title={photo.title}
                  text={photo.description}
                  images={[
                    {
                      url: photo.url,
                      width: photo.width,
                      height: photo.height,
                    },
                  ]}
                  createdAt={formatDate(photo.createdAt)}
                />
              )
            })}
          </div>
        )}
      </div>
    </ViewTransition>
  )
}
