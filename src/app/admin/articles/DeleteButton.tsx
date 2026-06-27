"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Loader2 } from "lucide-react"

export default function DeleteButton({
  articleId,
}: {
  articleId: number
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      await fetch(`/api/admin/articles/${articleId}`, {
        method: "DELETE",
      })
      router.refresh()
    } catch {
      alert("删除失败")
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            "确认"
          )}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          取消
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
      title="删除"
    >
      <Trash2 size={16} />
    </button>
  )
}
