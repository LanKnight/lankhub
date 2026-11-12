import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import { formatDate } from "@/lib/utils"
import CommentDeleteButton from "./CommentDeleteButton"
import Pagination from "@/components/blog/Pagination"

export const metadata: Metadata = {
  title: "评论管理 - 管理后台",
}

const PAGE_SIZE = 15

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  // 评论管理为站长专属
  const user = await getCurrentUser()
  if (user?.role !== "OWNER") redirect("/admin")

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1"))
  const skip = (page - 1) * PAGE_SIZE

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        author: { select: { id: true, name: true, email: true } },
        article: { select: { id: true, title: true, slug: true } },
        // 评论现在也可能挂在动态上（文章与动态恰好一个非空）
        moment: { select: { id: true, title: true, kind: true, text: true } },
      },
    }),
    prisma.comment.count(),
  ])
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">评论管理</h1>

      {comments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          {total === 0 ? "暂无评论" : "当前页没有评论"}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">评论内容</th>
                <th className="text-left px-5 py-3 font-medium">作者</th>
                <th className="text-left px-5 py-3 font-medium">来源</th>
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
                    {comment.author
                      ? comment.author.name || comment.author.email
                      : "匿名用户"}
                  </td>
                  <td className="px-5 py-3">
                    {comment.article ? (
                      <Link
                        href={`/blog/${comment.article.slug}`}
                        className="text-accent hover:underline line-clamp-1"
                        target="_blank"
                      >
                        {comment.article.title}
                      </Link>
                    ) : comment.moment ? (
                      <Link
                        href="/blog/moments"
                        className="text-accent hover:underline line-clamp-1"
                        target="_blank"
                      >
                        <span className="mr-1 text-xs text-gray-400">
                          {comment.moment.kind === "poem" ? "诗句" : "动态"}
                        </span>
                        {(comment.moment.title || comment.moment.text || "无标题").slice(0, 24)}
                      </Link>
                    ) : (
                      <span className="text-gray-400">（已删除）</span>
                    )}
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
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl="/admin/comments"
          />
        </>
      )}
    </div>
  )
}
