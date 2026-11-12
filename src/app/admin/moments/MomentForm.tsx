"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"

import { PHOTO_CATEGORIES } from "@/lib/photo-categories"

interface MomentImageState {
  url: string
  width?: number | null
  height?: number | null
}

export interface MomentFormValue {
  id?: number
  kind: "moment" | "poem"
  topic: string | null
  title: string | null
  text: string | null
  poemAuthor: string | null
  poemSource: string | null
  published: boolean
  sortOrder: number
  images: MomentImageState[]
}

const MAX_IMAGES = 9

/**
 * 动态的新建 / 编辑表单（同一个组件）。
 *
 * 图片走 `/api/upload`（单张上传），这里只维护 url 列表：
 * 动态最多 9 张，界面就是「点一下选图 → 预览 → 可删」，不做拖拽排序。
 */
export default function MomentForm({ initial }: { initial?: MomentFormValue }) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)

  const [kind, setKind] = useState<"moment" | "poem">(initial?.kind ?? "moment")
  const [topic, setTopic] = useState(initial?.topic ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [text, setText] = useState(initial?.text ?? "")
  const [poemAuthor, setPoemAuthor] = useState(initial?.poemAuthor ?? "")
  const [poemSource, setPoemSource] = useState(initial?.poemSource ?? "")
  const [published, setPublished] = useState(initial?.published ?? true)
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0))
  const [images, setImages] = useState<MomentImageState[]>(initial?.images ?? [])

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError("")

    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      setError(`最多 ${MAX_IMAGES} 张图`)
      return
    }

    setUploading(true)
    try {
      const picked = Array.from(files).slice(0, room)
      const added: MomentImageState[] = []
      for (const file of picked) {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: form })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.url) {
          setError(data?.error || "上传失败")
          continue
        }
        // 顺手记录尺寸，让前台按真实比例显示（竖图不被裁）
        const size = await new Promise<{ width?: number; height?: number }>((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = () => resolve({})
          img.src = data.url
        })
        added.push({ url: data.url, width: size.width, height: size.height })
      }
      setImages((prev) => [...prev, ...added])
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")

    if (!text.trim() && images.length === 0) {
      setError("至少写点文字或加一张图")
      return
    }

    setSaving(true)
    try {
      const payload = {
        kind,
        topic: kind === "poem" ? null : topic || null,
        title: kind === "poem" ? null : title.trim() || null,
        text: text.trim() || null,
        poemAuthor: kind === "poem" ? poemAuthor.trim() || null : null,
        poemSource: kind === "poem" ? poemSource.trim() || null : null,
        published,
        sortOrder: Number(sortOrder) || 0,
        images: kind === "poem" ? [] : images,
      }

      const res = await fetch(
        isEdit ? `/api/admin/moments/${initial!.id}` : "/api/admin/moments",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "保存失败")
        return
      }

      router.push("/admin/moments")
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 类型 */}
      <div className="flex items-center gap-3">
        {(["moment", "poem"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              kind === value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {value === "moment" ? "图文动态" : "诗句"}
          </button>
        ))}
      </div>

      {kind === "moment" && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">主题</label>
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">不设主题</option>
              {PHOTO_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">标题（可选）</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="给这条动态一个标题"
            />
          </div>
        </>
      )}

      {kind === "poem" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">作者</label>
            <input
              value={poemAuthor}
              onChange={(event) => setPoemAuthor(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="如：苏轼"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">出处</label>
            <input
              value={poemSource}
              onChange={(event) => setPoemSource(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="如：赤壁赋"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {kind === "poem" ? "诗句内容" : "正文"}
        </label>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={kind === "poem" ? 5 : 6}
          maxLength={5000}
          className={`w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent ${
            kind === "poem" ? "font-serif text-base leading-loose" : ""
          }`}
          placeholder={kind === "poem" ? "写下诗句，换行会保留" : "写点什么…"}
        />
        <p className="mt-1 text-xs text-gray-400">{text.length} / 5000</p>
      </div>

      {kind === "moment" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              图片（{images.length}/{MAX_IMAGES}）
            </label>
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 ${
                uploading || images.length >= MAX_IMAGES ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {uploading ? "上传中…" : "添加图片"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  void handleFiles(event.target.files)
                  event.target.value = ""
                }}
              />
            </label>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image, index) => (
                <div key={image.url} className="group relative overflow-hidden rounded-lg bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="移除这张图"
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-600 shadow-sm transition-colors hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            className="h-4 w-4"
          />
          已发布
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          排序
          <input
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            inputMode="numeric"
            className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-accent"
          />
        </label>
        <p className="text-xs text-gray-400">排序值越大越靠前</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || uploading}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "保存中…" : "保存"}
        </button>
        <Link
          href="/admin/moments"
          className="text-sm text-gray-500 transition-colors hover:text-gray-800"
        >
          取消
        </Link>
      </div>
    </form>
  )
}
