import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import CommentDeleteButton from "./CommentDeleteButton"

export const metadata: Metadata = {
  title: "评论管理 - 管理后台",
}

export default async function AdminCommentsPage() {
  const comments = await prisma.comment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
      article: { select: { id: true, title: true, slug: true } },
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">评论管理</h1>

      {comments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          暂无评论
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">评论内容</th>
                <th className="text-left px-5 py-3 font-medium">作者</th>
                <th className="text-left px-5 py-3 font-medium">所属文章</th>
                <th className="text-left px-5 py-3 font-medium">日期</th>
                <th className="text-right px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comments.map((comment) => (
                <tr key={comment.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-800 max-w-xs">
                    <p className="line-clamp-2">{comment.content}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {comment.author.name || comment.author.email}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/blog/${comment.article.slug}`}
                      className="text-accent hover:underline line-clamp-1"
                      target="_blank"
                    >
                      {comment.article.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                    {formatDate(comment.createdAt, "YYYY-MM-DD HH:mm")}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <CommentDeleteButton commentId={comment.id} />
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
