"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"

/**
 * 通用删除确认按钮（后台列表用）。
 * 修复：检查 res.ok，删除失败时内联显示错误而非静默/alert。
 */
export default function DeleteConfirmButton({
  apiPath,
  iconTitle = "删除",
  confirmLabel = "确认",
  warning,
  onSuccess,
}: {
  apiPath: string
  iconTitle?: string
  confirmLabel?: string
  /** 确认态下显示的前置说明（例如「该合集下 3 篇文章将移入未分类」） */
  warning?: string
  /** 删除成功后的回调，参数是服务端返回的 JSON（可能为 null） */
  onSuccess?: (data: unknown) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(apiPath, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error || `删除失败 (${res.status})`)
        setLoading(false)
        // 停留在确认态，让用户看到错误原因
        return
      }

      onSuccess?.(data)
      router.refresh()
    } catch {
      setError("网络错误，请稍后重试")
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        {warning && !error && (
          <p className="text-xs text-gray-400 text-right max-w-[220px]">
            {warning}
          </p>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
          <button
            onClick={() => {
              setConfirming(false)
              setError("")
            }}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            取消
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
      title={iconTitle}
      aria-label={iconTitle}
    >
      <Trash2 size={16} />
    </button>
  )
}
