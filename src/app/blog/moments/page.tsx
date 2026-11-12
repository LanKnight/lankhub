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
 * 数据源：`Moment` 表（图文动态 + 诗句都在这里）。
 * 兼容期：如果 `Moment` 还是空的、而旧相册 `Photo` 有数据，
 * 就**回退**读旧表 —— 这样迁移脚本还没跑的时候页面也不会突然空掉。
 * 迁移跑完（P3 之后）这条回退路径自然失效，不影响正常逻辑。
 */
export default async function MomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; kind?: string }>
}) {
  const params = await searchParams
  const topic =
    typeof params.topic === "string" && params.topic.length > 0 ? params.topic : undefined
  const kind =
    params.kind === "poem" || params.kind === "moment" ? params.kind : undefined

  const totalMoments = await prisma.moment.count()

  // ---------- 兼容期：回退到旧相册 ----------
  if (totalMoments === 0) {
    return <LegacyPhotoFeed topic={topic} />
  }

  const [moments, topicGroups] = await Promise.all([
    prisma.moment.findMany({
      where: {
        published: true,
        ...(topic ? { topic } : {}),
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.moment.groupBy({
      by: ["topic"],
      where: { published: true, kind: "moment", topic: { not: null } },
      _count: { _all: true },
    }),
  ])

  const counts = new Map(topicGroups.map((g) => [g.topic as string, g._count._all]))
  const topics = PHOTO_CATEGORIES.filter((c) => counts.has(c.slug))
  const totalVisible = [...counts.values()].reduce((a, b) => a + b, 0)

  const isActive = (href: string) => {
    const url = new URL(href, "http://local")
    return (url.searchParams.get("topic") ?? undefined) === topic &&
      (url.searchParams.get("kind") ?? undefined) === kind
  }

  const chip = (href: string, label: string, count?: number) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      aria-current={isActive(href) ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        isActive(href)
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={isActive(href) ? "ml-1.5 text-gray-300" : "ml-1.5 text-gray-400"}>
          {count}
        </span>
      )}
    </Link>
  )

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <BlogHeader active="moments" />

        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {chip("/blog/moments", "全部", totalVisible)}
          {topics.map((c) => chip(`/blog/moments?topic=${c.slug}`, c.label, counts.get(c.slug)))}
          {chip("/blog/moments?kind=poem", "诗句")}
        </div>

        {moments.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="text-lg">这里还没有内容</p>
            <p className="mt-2 text-sm">照片和随手记会陆续放到这里</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {moments.map((moment) => {
              const category = moment.topic ? getPhotoCategory(moment.topic) : undefined
              return (
                <MomentCard
                  key={moment.id}
                  kind={moment.kind === "poem" ? "poem" : "moment"}
                  topic={category?.label ?? moment.topic}
                  title={moment.title}
                  text={moment.text}
                  images={moment.images.map((image) => ({
                    url: image.url,
                    width: image.width,
                    height: image.height,
                  }))}
                  createdAt={formatDate(moment.createdAt)}
                  poemAuthor={moment.poemAuthor}
                  poemSource={moment.poemSource}
                  comments={{
                    momentId: moment.id,
                    count: moment._count.comments,
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </ViewTransition>
  )
}

/**
 * 兼容期渲染：直接读旧相册表。
 * 迁移脚本跑之前用它兜底；跑完之后（Moment 表非空）就再也走不到这里。
 */
async function LegacyPhotoFeed({ topic }: { topic?: string }) {
  const [photos, grouped] = await Promise.all([
    prisma.photo.findMany({
      where: topic ? { category: topic } : undefined,
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.photo.groupBy({ by: ["category"], _count: { _all: true } }),
  ])

  const counts = new Map(grouped.map((g) => [g.category, g._count._all]))
  const topics = PHOTO_CATEGORIES.filter((c) => counts.has(c.slug))

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <BlogHeader active="moments" />

        {topics.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/blog/moments"
              aria-current={!topic ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                !topic ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              全部
            </Link>
            {topics.map((c) => (
              <Link
                key={c.slug}
                href={`/blog/moments?topic=${c.slug}`}
                aria-current={topic === c.slug ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  topic === c.slug
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                {c.label}
                <span className={topic === c.slug ? "ml-1.5 text-gray-300" : "ml-1.5 text-gray-400"}>
                  {counts.get(c.slug)}
                </span>
              </Link>
            ))}
          </div>
        )}

        {photos.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="text-lg">这里还没有内容</p>
            <p className="mt-2 text-sm">照片和随手记会陆续放到这里</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {photos.map((photo) => (
              <MomentCard
                key={photo.id}
                topic={getPhotoCategory(photo.category)?.label ?? photo.category}
                title={photo.title}
                text={photo.description}
                images={[{ url: photo.url, width: photo.width, height: photo.height }]}
                createdAt={formatDate(photo.createdAt)}
              />
            ))}
          </div>
        )}
      </div>
    </ViewTransition>
  )
}
