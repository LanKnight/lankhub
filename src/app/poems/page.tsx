import type { Metadata } from "next"
import { ViewTransition } from "react"
import { prisma } from "@/lib/prisma"
import { staggerDelay } from "@/lib/motion"
import BackLink from "@/components/ui/BackLink"

export const metadata: Metadata = {
  title: "拾章",
  description: "收藏优美的诗词与文字，记录心动瞬间。",
}

export const dynamic = "force-dynamic"

export default async function PoemsPage() {
  const poems = await prisma.poem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      // Poem.authorId 关联字段名是 user（author 是诗句作者文本）
      user: { select: { name: true } },
    },
  })

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="max-w-5xl mx-auto px-4 py-16">
        <BackLink fallbackHref="/" className="mb-8" />

        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900">拾章</h1>
          <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
          <p className="text-gray-500 mt-4">拾取优美诗词，收藏心动字句</p>
        </div>

        {poems.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">✒️ 还没有收藏任何诗词</p>
            <p className="text-sm mt-2">敬请期待</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {poems.map((poem, index) => (
              <div
                key={poem.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col justify-between hover:shadow-md transition-shadow duration-200 animate-rise-in"
                style={{ animationDelay: staggerDelay(index) }}
              >
                {/* 诗句 */}
                <p className="text-gray-800 leading-loose whitespace-pre-line">
                  {poem.content}
                </p>
                {/* 作者 · 出处（均可选） */}
                {(poem.author || poem.source) && (
                  <p className="text-right text-sm text-gray-500 mt-6">
                    {poem.author ? `—— ${poem.author}` : ""}
                    {poem.source ? (
                      <span className="text-gray-400">《{poem.source.replace(/[《》]/g, "")}》</span>
                    ) : null}
                  </p>
                )}
                {/* 收录人（上传账号被删后匿名不显示） */}
                {poem.user?.name && (
                  <p className="text-right text-xs text-gray-400 mt-1">
                    由 {poem.user.name} 收录
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ViewTransition>
  )
}
