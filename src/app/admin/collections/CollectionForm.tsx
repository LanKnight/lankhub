"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, ImageIcon, X } from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { uploadWithProgress } from "@/lib/upload"
import { COVER_SUGGEST, describeCoverRatio, readImageSize } from "@/lib/cover-hint"
import { useCoverRatioHint } from "@/lib/use-cover-ratio-hint"

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
  const { toast } = useToast()
  const [name, setName] = useState(initialData?.name || "")
  const [description, setDescription] = useState(
    initialData?.description || ""
  )
  const [coverImage, setCoverImage] = useState(
    initialData?.coverImage || ""
  )
  /** 封面比例提示：选图时立刻算，或预览图加载完补算（与文章表单共用同一个 hook） */
  const { imgRef: coverImgRef, hint: coverHint, setHint: setCoverHint, measure: measureCover } =
    useCoverRatioHint(coverImage)
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverProgress, setCoverProgress] = useState(0)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isEditing = !!initialData

  /** 封面上传（复用 /api/upload + 进度条） */
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

    const size = await readImageSize(file)
    setCoverHint(size ? describeCoverRatio(size.width, size.height) : null)

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

      toast(isEditing ? "合集已更新" : "合集已创建", "success")
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
          封面图（可选，显示在合集列表和详情页顶部）
        </label>
        <p className="mb-2 text-xs text-gray-500">
          比例 2.35:1 · {COVER_SUGGEST}。其它比例的图会被<b className="font-medium">居中裁切</b>，具体损失见下方提示。
        </p>
        {coverImage ? (
          <div className="relative w-full max-w-md aspect-[47/20] rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={coverImgRef}
              src={coverImage}
              alt="封面预览"
              className="w-full h-full object-cover"
              onLoad={measureCover}
            />
            <button
              type="button"
              onClick={() => {
                setCoverImage("")
                setCoverHint(null)
              }}
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
            className="w-full max-w-md aspect-[47/20] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors disabled:opacity-60"
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
        {coverUploading && (
          <div className="w-full max-w-md h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${coverProgress}%` }}
            />
          </div>
        )}
        {coverHint && (
          <p
            className={`mt-2 text-xs ${
              coverHint.level === "ok" ? "text-gray-500" : "text-amber-600"
            }`}
          >
            {coverHint.text}
          </p>
        )}
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
