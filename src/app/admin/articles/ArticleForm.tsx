"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Loader2, Save, Eye, EyeOff } from "lucide-react"

const RichTextEditor = dynamic(
  () => import("@/components/editor/RichTextEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400">
        加载编辑器中...
      </div>
    ),
  }
)

interface ArticleFormProps {
  initialData?: {
    id: number
    title: string
    slug: string
    summary: string
    content: string
    published: boolean
  }
}

export default function ArticleForm({ initialData }: ArticleFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialData?.title || "")
  const [summary, setSummary] = useState(initialData?.summary || "")
  const [content, setContent] = useState(initialData?.content || "")
  const [published, setPublished] = useState(
    initialData?.published || false
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isEditing = !!initialData

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!title.trim()) {
      setError("请输入文章标题")
      return
    }
    if (!content) {
      setError("请输入文章内容")
      return
    }

    setLoading(true)

    try {
      const url = isEditing
        ? `/api/admin/articles/${initialData.id}`
        : "/api/admin/articles"
      const method = isEditing ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, content, published }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "保存失败")
        setLoading(false)
        return
      }

      router.push("/admin/articles")
      router.refresh()
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题"
          className="w-full px-4 py-3 text-xl font-bold rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all"
        />
      </div>

      {/* Summary */}
      <div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="文章摘要（可选，将显示在文章列表卡片中）"
          rows={2}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm resize-none"
        />
      </div>

      {/* Editor */}
      <RichTextEditor
        content={content}
        onChange={(json) => setContent(json)}
      />

      {/* Actions */}
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
          {loading ? "保存中..." : isEditing ? "更新文章" : "保存文章"}
        </button>

        <button
          type="button"
          onClick={() => setPublished(!published)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors text-sm ${
            published
              ? "border-green-300 bg-green-50 text-green-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {published ? <Eye size={16} /> : <EyeOff size={16} />}
          {published ? "已发布" : "存为草稿"}
        </button>
      </div>
    </form>
  )
}
