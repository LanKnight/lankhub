import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"

import DeleteConfirmButton from "@/components/admin/DeleteConfirmButton"
import { getCurrentUser } from "@/lib/auth-helpers"
import { userHasPermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { PHOTO_CATEGORIES, getPhotoCategory } from "@/lib/photo-categories"
import { formatDate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "动态管理 - 管理后台",
}

/**
 * 动态管理：图文动态与诗句都在这里。
 *
 * 取代了原来的「相册管理 / 拾章管理」两个入口 —— 这两类内容现在同属一个信息流，
 * 分成两套后台只会让同一件事有两个编辑入口。
 */
export default async function AdminMomentsPage() {
  const user = await getCurrentUser()
  // 有「动态管理」权限即可（站长恒有）
  if (!user || !userHasPermission(user, "moment")) redirect("/admin")

  const moments = await prisma.moment.findMany({
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      topic: true,
      title: true,
      text: true,
      published: true,
      createdAt: true,
      authorId: true,
      images: { select: { id: true, url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { images: true, comments: true } },
    },
  })

  // 站长能改全部；授权读者只能改自己发的（别人的行只读，与文章模块一致）
  const isOwner = user.role === "OWNER"
  const myId = Number.parseInt(user.id, 10)
  const canEdit = (authorId: number | null) => isOwner || authorId === myId

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">动态管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {moments.length} 条（图文 {moments.filter((m) => m.kind === "moment").length} / 诗句{" "}
            {moments.filter((m) => m.kind === "poem").length}）
          </p>
        </div>
        <Link
          href="/admin/moments/new"
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700"
        >
          <Plus size={15} />
          新建动态
        </Link>
      </div>

      {moments.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-gray-400">
          还没有动态，点右上角「新建动态」
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">配图</th>
                <th className="px-4 py-3 text-left font-medium">类型</th>
                <th className="px-4 py-3 text-left font-medium">主题</th>
                <th className="px-4 py-3 text-left font-medium">内容</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">日期</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {moments.map((moment) => {
                const category = moment.topic ? getPhotoCategory(moment.topic) : undefined
                const preview = moment.title || moment.text || "（无内容）"
                return (
                  <tr key={moment.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      {moment.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={moment.images[0].url}
                          alt=""
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">
                          文字
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {moment.kind === "poem" ? "诗句" : "图文"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {category?.label ?? moment.topic ?? "—"}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-gray-800">
                      <p className="line-clamp-2">{preview}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        图 {moment._count.images} · 评论 {moment._count.comments}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          moment.published
                            ? "bg-green-50 text-green-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {moment.published ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                      {formatDate(moment.createdAt, "YYYY-MM-DD")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {canEdit(moment.authorId) ? (
                          <>
                            <Link
                              href={`/admin/moments/${moment.id}/edit`}
                              className="text-sm text-accent hover:underline"
                            >
                              编辑
                            </Link>
                            <DeleteConfirmButton apiPath={`/api/admin/moments/${moment.id}`} />
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">只读</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        主题候选：{PHOTO_CATEGORIES.map((c) => c.label).join(" / ")}（诗句不需要主题）
      </p>
    </div>
  )
}
