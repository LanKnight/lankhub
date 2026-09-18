import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Edit, Pin, FolderOpen } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import { formatDate } from "@/lib/utils"
import DeleteButton from "./DeleteButton"
import Pagination from "@/components/blog/Pagination"

export const metadata: Metadata = {
  title: "文章管理 - 管理后台",
}

const PAGE_SIZE = 10

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await getCurrentUser()
  const myId = parseInt(user?.id || "0")
  const isOwner = user?.role === "OWNER"
  // 看全部文章（含站长的）；授权读者只能操作自己创建的文章（别人的行只读）

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1"))
  const skip = (page - 1) * PAGE_SIZE

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      include: {
        author: { select: { id: true, name: true } },
        collection: { select: { name: true, slug: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.article.count(),
  ])
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">文章管理</h1>
        <Link
          href="/admin/articles/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
        >
          <Plus size={16} />
          新建文章
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          {total === 0
            ? "暂无文章，点击上方按钮创建第一篇"
            : "当前页没有文章"}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-center px-3 py-3 font-medium w-[52px]">
                    序号
                  </th>
                  <th className="text-left px-5 py-3 font-medium w-[30%]">
                    标题
                  </th>
                  <th className="text-left px-5 py-3 font-medium">合集</th>
                  <th className="text-left px-5 py-3 font-medium">作者</th>
                  <th className="text-left px-5 py-3 font-medium">状态</th>
                  <th className="text-center px-5 py-3 font-medium w-[60px]">置顶</th>
                  <th className="text-left px-5 py-3 font-medium">评论</th>
                  <th className="text-left px-5 py-3 font-medium">日期</th>
                  <th className="text-right px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {articles.map((article, index) => (
                  <tr key={article.id} className="hover:bg-gray-50/50">
                    {/*
                      当前页的显示行号：跨页连续（第 2 页从 11 开始），
                      不是文章 ID，也不是数据库字段 —— 置顶会改变它的位置
                    */}
                    <td className="px-3 py-3 text-center text-gray-400 tabular-nums">
                      {skip + index + 1}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-gray-800 line-clamp-1">
                        {article.title}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {article.collection ? (
                        <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                          <FolderOpen size={12} />
                          {article.collection.name}
                        </span>
                      ) : (
                        // 已发布却没合集 = 违反「发布必有合集」的约定，标出来提醒补齐
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            article.published
                              ? "bg-red-50 text-red-600"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {article.published ? "缺合集" : "未归类"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-500">
                        {article.author?.name || "未知"}
                        {article.authorId === myId && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                            我
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          article.published
                            ? "bg-green-50 text-green-600"
                            : "bg-yellow-50 text-yellow-600"
                        }`}
                      >
                        {article.published ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {article.pinned ? (
                        <Pin size={14} className="text-amber-500 inline" />
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {article._count.comments}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {formatDate(article.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {isOwner || article.authorId === myId ? (
                          <>
                            <Link
                              href={`/admin/articles/${article.id}/edit`}
                              className="p-1.5 text-gray-400 hover:text-accent transition-colors"
                              title="编辑"
                            >
                              <Edit size={16} />
                            </Link>
                            <DeleteButton articleId={article.id} />
                          </>
                        ) : (
                          <span
                            className="text-xs text-gray-300"
                            title="只能操作自己创建的文章"
                          >
                            只读
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl="/admin/articles"
          />
        </>
      )}
    </div>
  )
}
