import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { FileText, MessageSquare, Eye, PenLine } from "lucide-react"

export const metadata: Metadata = {
  title: "仪表盘 - 管理后台",
}

export default async function AdminDashboard() {
  const [totalArticles, publishedArticles, totalComments, totalViews] =
    await Promise.all([
      prisma.article.count(),
      prisma.article.count({ where: { published: true } }),
      prisma.comment.count(),
      prisma.article
        .aggregate({ _sum: { viewCount: true } })
        .then((r) => r._sum.viewCount || 0),
    ])

  const recentArticles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      published: true,
      viewCount: true,
      createdAt: true,
    },
  })

  const stats = [
    {
      label: "文章总数",
      value: totalArticles,
      icon: FileText,
      color: "text-blue-500 bg-blue-50",
    },
    {
      label: "已发布",
      value: publishedArticles,
      icon: PenLine,
      color: "text-green-500 bg-green-50",
    },
    {
      label: "评论总数",
      value: totalComments,
      icon: MessageSquare,
      color: "text-purple-500 bg-purple-50",
    },
    {
      label: "总阅读量",
      value: totalViews,
      icon: Eye,
      color: "text-orange-500 bg-orange-50",
    },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4"
          >
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}
            >
              <stat.icon size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {stat.value}
              </p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent articles */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">最近文章</h2>
        </div>
        {recentArticles.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">暂无文章</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">标题</th>
                <th className="text-left px-5 py-3 font-medium">状态</th>
                <th className="text-left px-5 py-3 font-medium">阅读量</th>
                <th className="text-left px-5 py-3 font-medium">日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentArticles.map((article) => (
                <tr key={article.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-800">
                    {article.title}
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
                    {article.viewCount}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(article.createdAt).toLocaleDateString(
                      "zh-CN"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
