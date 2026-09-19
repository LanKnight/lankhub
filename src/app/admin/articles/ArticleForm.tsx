"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Loader2,
  Save,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  ImageIcon,
  FolderPlus,
  X,
} from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { uploadWithProgress } from "@/lib/upload"
import type { RichTextEditorHandle } from "@/components/editor/RichTextEditor"

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
    coverImage?: string | null
    published: boolean
    pinned: boolean
    collectionId?: number | null
  }
  collections?: { id: number; name: string }[]
  /** 保存成功后跳回的地址（默认文章列表第 1 页；从列表第 N 页进来时带上 ?page=N） */
  returnTo?: string
}

export default function ArticleForm({
  initialData,
  collections = [],
  returnTo = "/admin/articles",
}: ArticleFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const hasCollections = collections.length > 0
  const [title, setTitle] = useState(initialData?.title || "")
  const [summary, setSummary] = useState(initialData?.summary || "")
  const [content, setContent] = useState(initialData?.content || "")
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "")
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverProgress, setCoverProgress] = useState(0)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [collectionId, setCollectionId] = useState<number | null>(
    initialData?.collectionId ?? null
  )
  const [published, setPublished] = useState(
    initialData?.published || false
  )
  const [pinned, setPinned] = useState(
    initialData?.pinned || false
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // 编辑器同步读取句柄（保存时绕过防抖取最新内容，避免刚插入的图片丢失）
  const editorRef = useRef<RichTextEditorHandle>(null)

  const isEditing = !!initialData

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      setError("仅支持 JPG、PNG、GIF、WebP 格式的图片")
      e.target.value = ""
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小不能超过 10MB")
      e.target.value = ""
      return
    }

    setCoverUploading(true)
    setCoverProgress(0)
    setError("")

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await uploadWithProgress(
        "/api/upload",
        formData,
        setCoverProgress
      )
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error || "封面上传失败")
        setCoverUploading(false)
        return
      }

      if (data?.url) {
        setCoverImage(data.url)
        toast("封面上传成功", "success")
      }
    } catch {
      setError("封面上传失败，请重试")
    } finally {
      setCoverUploading(false)
      e.target.value = ""
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!title.trim()) {
      setError("请输入文章标题")
      return
    }
    // 保存前同步读取编辑器最新内容（绕过 300ms 防抖，防止刚插入的图片/文字丢失）
    const finalContent = editorRef.current?.getLatestJson() ?? content
    // 空文校验：全删内容后 TipTap 序列化为 {"type":"doc","content":[]}，truthy 但无实际内容
    if (!hasArticleContent(finalContent)) {
      setError("请输入文章内容")
      return
    }
    // 发布前置条件：已发布必须归属某个合集（与服务端 PublishRequirementSchema 一致）
    if (published && !collectionId) {
      setError(
        hasCollections
          ? "发布文章前请先选择所属合集"
          : "还没有可选的合集，请先创建一个合集再发布"
      )
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
        body: JSON.stringify({
          title,
          summary,
          content: finalContent,
          coverImage,
          published,
          pinned,
          collectionId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "保存失败")
        setLoading(false)
        return
      }

      toast(isEditing ? "文章已更新" : "文章已保存", "success")
      router.push(returnTo)
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

      {/* Cover image */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          封面图（可选，显示在文章列表顶部横幅）
        </label>
        {coverImage ? (
          <div className="relative w-full max-w-md aspect-[3/1] rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImage}
              alt="封面预览"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setCoverImage("")}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title="移除封面"
              aria-label="移除封面"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            className="w-full max-w-md aspect-[3/1] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors disabled:opacity-60"
          >
            {coverUploading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs">上传中 {coverProgress}%</span>
              </>
            ) : (
              <>
                <ImageIcon size={20} />
                <span className="text-xs">选择封面图片</span>
              </>
            )}
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleCoverSelect}
          className="hidden"
        />
        {/* 上传进度条 */}
        {coverUploading && (
          <div className="w-full max-w-md h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${coverProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Collection */}
      <div>
        <label
          htmlFor="article-collection"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          所属合集
          {published ? (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="ml-1 text-xs font-normal text-gray-400">
              （草稿可暂不选择，发布前必须选）
            </span>
          )}
        </label>

        {hasCollections ? (
          <select
            id="article-collection"
            value={collectionId ?? ""}
            onChange={(e) =>
              setCollectionId(e.target.value ? parseInt(e.target.value) : null)
            }
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm bg-white"
          >
            <option value="">
              {published ? "请选择合集" : "暂不归类"}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          // 一个合集都没有时必须给出出口：否则「发布必须选合集」会让文章永远发不出去
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-700">
            <FolderPlus size={16} className="shrink-0 mt-0.5" />
            <span>
              还没有可选的合集，
              <Link
                href="/admin/collections/new"
                className="font-medium underline hover:text-amber-900"
              >
                先去创建一个
              </Link>
              {published ? "，否则无法发布。" : "，发布前需要先创建。"}
            </span>
          </div>
        )}
      </div>

      {/* Editor */}
      <RichTextEditor
        ref={editorRef}
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

        <button
          type="button"
          onClick={() => setPinned(!pinned)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors text-sm ${
            pinned
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {pinned ? <Pin size={16} /> : <PinOff size={16} />}
          {pinned ? "已置顶" : "置顶文章"}
        </button>
      </div>
    </form>
  )
}

/** 判断 TipTap JSON 内容是否包含实际文本/图片（防止保存空文档） */
function hasArticleContent(content: string): boolean {
  if (!content) return false
  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object") return false
    const nodes = parsed.content
    return Array.isArray(nodes) && nodes.length > 0
  } catch {
    return content.trim().length > 0
  }
}
