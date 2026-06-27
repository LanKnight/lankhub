"use client"

export default function CommentSection({
  articleId,
  initialComments,
}: {
  articleId: number
  initialComments: any[]
}) {
  return (
    <section className="space-y-8">
      <h2 className="text-xl font-bold text-gray-900">
        评论 ({initialComments.length})
      </h2>
      <CommentForm articleId={articleId} />
      <CommentList comments={initialComments} articleId={articleId} />
    </section>
  )
}

import { useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Send, Loader2 } from "lucide-react"

function CommentForm({
  articleId,
  parentId,
  onSuccess,
}: {
  articleId: number
  parentId?: number
  onSuccess?: () => void
}) {
  const { data: session } = useSession()
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!session) {
    return (
      <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-500 text-center">
        请先{" "}
        <Link
          href="/auth/login"
          className="text-accent hover:underline font-medium"
        >
          登录
        </Link>{" "}
        后发表评论
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setLoading(true)
    setError("")

    try {
      const res = await fetch(`/api/articles/${articleId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          parentId: parentId || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "评论失败")
        setLoading(false)
        return
      }

      setContent("")
      onSuccess?.()
      // Refresh the page to show new comment
      window.location.reload()
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={parentId ? "写下你的回复..." : "写下你的评论..."}
        rows={3}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm resize-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {loading ? "提交中..." : "发表"}
        </button>
      </div>
    </form>
  )
}

function CommentList({
  comments,
  articleId,
}: {
  comments: any[]
  articleId: number
}) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        暂无评论，来发表第一条评论吧
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          articleId={articleId}
        />
      ))}
    </div>
  )
}

function CommentItem({
  comment,
  articleId,
}: {
  comment: any
  articleId: number
}) {
  const [showReply, setShowReply] = useState(false)
  const { data: session } = useSession()

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-brand-cyan/30 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-gray-600">
            {comment.author?.name?.charAt(0) || "匿"}
          </span>
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">
              {comment.author?.name || "匿名"}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(comment.createdAt).toLocaleDateString("zh-CN")}
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {comment.content}
          </p>
          <div className="flex items-center gap-3">
            {session && (
              <button
                onClick={() => setShowReply(!showReply)}
                className="text-xs text-gray-400 hover:text-accent transition-colors"
              >
                {showReply ? "取消回复" : "回复"}
              </button>
            )}
          </div>

          {/* Reply form */}
          {showReply && (
            <div className="mt-3 ml-2 pl-3 border-l-2 border-gray-100">
              <CommentForm
                articleId={articleId}
                parentId={comment.id}
                onSuccess={() => setShowReply(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-6 pl-4 border-l-2 border-gray-100 space-y-3">
          {comment.replies.map((reply: any) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              articleId={articleId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
