"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"

interface CollectionFormProps {
  initialData?: {
    id: number
    name: string
    slug: string
    description: string
    coverImage: string
    sortOrder: number
  }
}

export default function CollectionForm({ initialData }: CollectionFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialData?.name || "")
  const [description, setDescription] = useState(
    initialData?.description || ""
  )
  const [coverImage, setCoverImage] = useState(
    initialData?.coverImage || ""
  )
  const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isEditing = !!initialData

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError("请输入合集名称")
      return
    }

    setLoading(true)

    try {
      const url = isEditing
        ? `/api/admin/collections/${initialData.id}`
        : "/api/admin/collections"
      const method = isEditing ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, coverImage, sortOrder }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "保存失败")
        setLoading(false)
        return
      }

      router.push("/admin/collections")
      router.refresh()
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          合集名称
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：前端开发系列"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          合集描述
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简要描述这个合集的内容..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          封面图片 URL（可选）
        </label>
        <input
          type="text"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          排序序号
        </label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
          className="w-32 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all"
        />
        <p className="text-xs text-gray-400 mt-1">数字越小越靠前</p>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {loading ? "保存中..." : isEditing ? "更新合集" : "创建合集"}
        </button>
      </div>
    </form>
  )
}
