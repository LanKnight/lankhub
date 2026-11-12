"use client"

import { useState } from "react"
import { Loader2, MessageSquare } from "lucide-react"

import CommentSection from "@/components/comment/CommentSection"

/**
 * 动态卡片下方的评论入口。
 *
 * 为什么默认收起、点开才拉：
 * 信息流一屏可能有十几条动态，如果每条都直接渲染完整评论树，
 * 首屏会多出十几组请求。收起 + 按需加载，代价只是多点一次。
 */
export default function MomentComments({
  momentId,
  count,
}: {
  momentId: number
  count: number
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<unknown[] | null>(null)
  const [error, setError] = useState("")

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (comments) return

    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/moments/${momentId}/comments`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "评论加载失败")
        return
      }
      setComments(Array.isArray(data) ? data : [])
    } catch {
      setError("网络错误")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900"
      >
        <MessageSquare size={14} />
        {count > 0 ? `评论 ${count}` : "评论"}
        {open ? "（收起）" : ""}
      </button>

      {open && (
        <div className="mt-4">
          {loading ? (
            <p className="flex items-center gap-2 py-4 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              正在加载评论…
            </p>
          ) : error ? (
            <p className="py-3 text-sm text-red-500">{error}</p>
          ) : (
            <CommentSection
              target={{ type: "moment", id: momentId }}
              initialComments={(comments ?? []) as any[]}
            />
          )}
        </div>
      )}
    </div>
  )
}
