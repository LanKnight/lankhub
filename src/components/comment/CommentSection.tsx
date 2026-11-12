"use client"

import { useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Send, Loader2 } from "lucide-react"
import { timeAgo } from "@/lib/utils"

/** 评论可以挂在文章或动态上；两种内容的接口路径不同，其余逻辑完全一致 */
export type CommentTarget = { type: "article" | "moment"; id: number }

export default function CommentSection({
  target,
  initialComments,
}: {
  target: CommentTarget
  initialComments: any[]
}) {
  const endpoint =
    target.type === "moment"
      ? `/api/moments/${target.id}/comments`
      : `/api/articles/${target.id}/comments`
  const [comments, setComments] = useState<any[]>(initialComments)

  // 新评论本地插入评论树（不刷新页面）
  const handleCommentCreated = useCallback((comment: any) => {
    setComments((prev) => {
      const next = prev.map((c) => ({ ...c, replies: [...(c.replies || [])] }))
      if (!comment.parentId) {
        return [...next, comment]
      }
      const insertInto = (list: any[]): boolean => {
        for (const item of list) {
          if (item.id === comment.parentId) {
            item.replies = [...(item.replies || []), comment]
            return true
          }
          if (item.replies?.length && insertInto(item.replies)) return true
        }
        return false
      }
      return insertInto(next) ? next : [...next, comment]
    })
  }, [])

  return (
    <section className="space-y-8">
      <h2 className="text-xl font-bold text-gray-900">
        评论 ({comments.length})
      </h2>
      <CommentForm endpoint={endpoint} onSuccess={handleCommentCreated} />
      <CommentList
        comments={comments}
        endpoint={endpoint}
        onCommentCreated={handleCommentCreated}
      />
    </section>
  )
}

function CommentForm({
  endpoint,
  parentId,
  onSuccess,
}: {
  /** 评论接口地址（文章或动态） */
  endpoint: string
  parentId?: number
  onSuccess?: (comment: any) => void
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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          parentId: parentId || undefined,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error || "评论失败")
        setLoading(false)
        return
      }

      setContent("")
      setLoading(false)
      // 本地插入新评论，无需整页刷新
      onSuccess?.(data)
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
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
  endpoint,
  onCommentCreated,
}: {
  comments: any[]
  endpoint: string
  onCommentCreated: (comment: any) => void
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
          endpoint={endpoint}
          onCommentCreated={onCommentCreated}
        />
      ))}
    </div>
  )
}

function CommentItem({
  comment,
  endpoint,
  onCommentCreated,
}: {
  comment: any
  endpoint: string
  onCommentCreated: (comment: any) => void
}) {
  const [showReply, setShowReply] = useState(false)
  const { data: session } = useSession()

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Avatar（有头像显示图片，否则首字母） */}
        {comment.author?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={comment.author.avatar}
            alt={comment.author?.name || "用户头像"}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-brand-cyan/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-gray-600">
              {comment.author?.name?.charAt(0) || "匿"}
            </span>
          </div>
        )}

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">
              {comment.author?.name || "匿名"}
            </span>
            <span className="text-xs text-gray-400">
              {timeAgo(comment.createdAt)}
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
                endpoint={endpoint}
                parentId={comment.id}
                onSuccess={(c) => {
                  setShowReply(false)
                  onCommentCreated(c)
                }}
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
              endpoint={endpoint}
              onCommentCreated={onCommentCreated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
