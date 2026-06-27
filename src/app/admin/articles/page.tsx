import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Edit, Trash2 } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import DeleteButton from "./DeleteButton"

export const metadata: Metadata = {
  title: "文章管理 - 管理后台",
}

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { comments: true } },
    },
  })

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
          暂无文章，点击上方按钮创建第一篇
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium w-[35%]">
                  标题
                </th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
                <th className="text-left px-5 py-3 font-medium">评论</th>
                <th className="text-left px-5 py-3 font-medium">日期</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articles.map((article) => (
                <tr key={article.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <span className="text-gray-800 line-clamp-1">
                      {article.title}
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
                  <td className="px-5 py-3 text-gray-500">
                    {article._count.comments}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {formatDate(article.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/articles/${article.id}/edit`}
                        className="p-1.5 text-gray-400 hover:text-accent transition-colors"
                        title="编辑"
                      >
                        <Edit size={16} />
                      </Link>
                      <DeleteButton articleId={article.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
