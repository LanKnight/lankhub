import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Plus, Edit3 } from "lucide-react"
import DeleteButton from "./DeleteButton"

export const metadata: Metadata = {
  title: "合集管理 - 管理后台",
}

export default async function AdminCollectionsPage() {
  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { articles: true },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">合集管理</h1>
        <Link
          href="/admin/collections/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          新建合集
        </Link>
      </div>

      {collections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">暂无合集</p>
          <p className="text-sm mt-1">创建合集来组织你的文章</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  名称
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  Slug
                </th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  文章数
                </th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  排序
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {collections.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">
                      {c.name}
                    </span>
                    {c.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                        {c.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                      {c.slug}
                    </code>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="text-sm text-gray-600">
                      {c._count.articles}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="text-sm text-gray-600">{c.sortOrder}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/collections/${c.id}/edit`}
                        className="p-1.5 text-gray-400 hover:text-accent transition-colors"
                        title="编辑"
                      >
                        <Edit3 size={16} />
                      </Link>
                      <DeleteButton collectionId={c.id} />
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
