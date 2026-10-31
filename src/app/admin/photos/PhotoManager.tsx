"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Image from "next/image"
import { Upload, X, Check, Trash2, Edit3, Loader2, Lock } from "lucide-react"
import { PHOTO_CATEGORIES } from "@/lib/photo-categories"
import { uploadWithProgress } from "@/lib/upload"
import { toUploadFile, type CompressResult } from "@/lib/image-compress"
import ImageCompressor from "@/components/admin/ImageCompressor"

interface Photo {
  id: number
  url: string
  filename: string
  category: string
  title: string | null
  description: string | null
  width: number | null
  height: number | null
  sortOrder: number
  authorId: number | null
  author?: { name: string } | null
  createdAt: string
  updatedAt: string
}

interface PhotoManagerProps {
  initialPhotos: Photo[]
}

export default function PhotoManager({ initialPhotos }: PhotoManagerProps) {
  const router = useRouter()
  const { data: session } = useSession()
  // session.user 的扩展字段由 src/types/next-auth.d.ts 声明，不需要 any 断言
  const myId = parseInt(session?.user?.id || "0")
  const isOwner = session?.user?.role === "OWNER"
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [filter, setFilter] = useState<string>("all")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState<string>("programming")
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadDescription, setUploadDescription] = useState("")
  const [imageDims, setImageDims] = useState<{
    width: number
    height: number
  } | null>(null)
  /** 压缩结果（上传的就是它，不是原图） */
  const [compressed, setCompressed] = useState<CompressResult | null>(null)
  /** 压缩进行中（上传按钮据此禁用） */
  const [compressing, setCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCategory, setEditCategory] = useState<string>("")
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editSortOrder, setEditSortOrder] = useState(0)
  const [savingId, setSavingId] = useState<number | null>(null)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 前端分页：每页 20 张，"加载更多"
  const [visibleCount, setVisibleCount] = useState(20)
  const PAGE_STEP = 20

  // 组件卸载时释放预览 objectURL（防内存泄漏）
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredPhotos =
    filter === "all"
      ? photos
      : photos.filter((p) => p.category === filter)

  const visiblePhotos = filteredPhotos.slice(0, visibleCount)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side validation
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]
    if (!allowedTypes.includes(file.type)) {
      setError("仅支持 JPG、PNG、GIF、WebP 格式的图片")
      return
    }


    /*
     * 真正的上传上限是反向代理的约 1MB（实测 1024KB 能进应用、1100KB 直接被 413）。
     * 所以这里只兜"别把 100MP 的怪物塞进解码器"，压缩交给下面的 ImageCompressor。
     */
    const MAX_SIZE = 30 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      setError("图片太大了（超过 30MB），请先手动压缩后再上传")
      return
    }

    setError(null)
    setSelectedFile(file)
    setCompressed(null)
    // 释放旧预览 URL，避免内存泄漏
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))

    // Read dimensions
    createImageBitmap(file)
      .then((bitmap) => {
        setImageDims({ width: bitmap.width, height: bitmap.height })
        bitmap.close()
      })
      .catch(() => {
        setImageDims(null)
      })
  }

  // Safely parse JSON from a response, falling back to a readable error
  async function safeJson(res: Response) {
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      // Server returned non-JSON (e.g. 413 HTML error page from the reverse proxy)。
      // 正常流程下不该走到这里了：图片在浏览器里已压到 900KB 以内。
      if (res.status === 413) {
        throw new Error("图片太大，被服务器拒绝（请求体上限约 1MB）。请把长边或质量再调低。")
      }
      throw new Error(`服务器错误 (${res.status})，请稍后重试`)
    }
    try {
      return await res.json()
    } catch {
      throw new Error("服务器返回了无效数据，请稍后重试")
    }
  }

  async function handleUpload() {
    if (!selectedFile) return
    if (!compressed) {
      setError("还在压缩，稍等一下再上传")
      return
    }
    if (compressed.size > compressed.targetBytes) {
      setError(
        `压缩后仍有 ${(compressed.size / 1024 / 1024).toFixed(2)} MB，超过约 1MB 的上传上限：请在「调整」里把长边或质量再调低`
      )
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      // Step 1: Upload file（XHR 带进度）—— 传的是压缩后的 blob，不是原图
      const formData = new FormData()
      formData.append("file", toUploadFile(compressed, selectedFile.name))

      const uploadRes = await uploadWithProgress(
        "/api/upload",
        formData,
        setUploadProgress
      )

      if (!uploadRes.ok) {
        const data = await safeJson(uploadRes)
        throw new Error(data.error || "上传失败")
      }

      const { url } = await safeJson(uploadRes)
      const filename = url.split("/").pop()

      // Step 2: Register in database（宽高用压缩后的真实尺寸）
      const photoRes = await fetch("/api/admin/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          filename,
          category: uploadCategory,
          title: uploadTitle || null,
          description: uploadDescription || null,
          width: compressed.width ?? imageDims?.width ?? null,
          height: compressed.height ?? imageDims?.height ?? null,
        }),
      })

      if (!photoRes.ok) {
        const data = await safeJson(photoRes)
        throw new Error(data.error || "注册照片失败")
      }

      const newPhoto = await safeJson(photoRes)

      // Reset form
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setSelectedFile(null)
      setPreviewUrl(null)
      setUploadTitle("")
      setUploadDescription("")
      setImageDims(null)
      setCompressed(null)
      if (fileInputRef.current) fileInputRef.current.value = ""

      // Update list
      setPhotos((prev) => [newPhoto, ...prev])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败")
    } finally {
      setUploading(false)
    }
  }

  function startEdit(photo: Photo) {
    setEditingId(photo.id)
    setEditCategory(photo.category)
    setEditTitle(photo.title || "")
    setEditDescription(photo.description || "")
    setEditSortOrder(photo.sortOrder)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSaveEdit(id: number) {
    if (savingId === id) return // 防双击并发提交
    setError(null)
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/photos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: editCategory,
          title: editTitle || null,
          description: editDescription || null,
          sortOrder: editSortOrder,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "更新失败")
      }

      const updated = await res.json()
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
      )
      setEditingId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败")
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    try {
      const res = await fetch(`/api/admin/photos/${id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "删除失败")
      }

      setPhotos((prev) => prev.filter((p) => p.id !== id))
      setDeletingId(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败")
    }
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-0.5 hover:bg-red-100 rounded"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Upload panel */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">上传照片</h2>
        <div className="flex flex-col sm:flex-row gap-6">
          {/* File picker + preview */}
          <div className="flex-shrink-0">
            {previewUrl ? (
              <div className="relative w-40 h-40 rounded-lg overflow-hidden border border-gray-200">
                <Image
                  src={previewUrl}
                  alt="预览"
                  fill
                  className="object-cover"
                />
                <button
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl)
                    setSelectedFile(null)
                    setPreviewUrl(null)
                    setImageDims(null)
                    setCompressed(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-40 h-40 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
              >
                <Upload size={24} />
                <span className="text-xs">选择图片</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            {imageDims && (
              <p className="text-xs text-gray-400 text-center mt-2">
                原图 {imageDims.width} × {imageDims.height}
              </p>
            )}
          </div>

          {/* Form fields */}
          <div className="flex-1 flex flex-col gap-4">
            {/*
              压缩面板：选完图自动压（相册档 = 长边 2560 + WebP q0.82），
              上传的是压缩结果，不是原图 —— 否则会被反向代理的 ~1MB 上限挡成 413。
            */}
            {selectedFile && (
              <ImageCompressor
                file={selectedFile}
                preset="photo"
                onResult={setCompressed}
                onBusyChange={setCompressing}
              />
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              >
                {PHOTO_CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                标题（可选）
              </label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="给照片起个名字"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                描述（可选）
              </label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="简单描述这张照片"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !compressed || uploading || compressing}
              className="self-start flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={16} />
              {uploading ? `上传中 ${uploadProgress}%` : "上传照片"}
            </button>
            {/* 上传进度条 */}
            {uploading && (
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-[width] duration-200 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs + photo list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1 p-4 border-b border-gray-100 bg-gray-50/50">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            全部 ({photos.length})
          </button>
          {PHOTO_CATEGORIES.map((cat) => {
            const count = photos.filter((p) => p.category === cat.slug).length
            return (
              <button
                key={cat.slug}
                onClick={() => setFilter(cat.slug)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === cat.slug
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {cat.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Photo list */}
        {filteredPhotos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">暂无照片</p>
            <p className="text-sm mt-1">先上传一张吧</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
            {visiblePhotos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50/30"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square bg-gray-200">
                  {photo.width && photo.height ? (
                    <Image
                      src={photo.url}
                      alt={photo.title || "照片"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt={photo.title || "照片"}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Info / Edit */}
                <div className="p-3">
                  {editingId === photo.id ? (
                    // Edit mode
                    <div className="space-y-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
                      >
                        {PHOTO_CATEGORIES.map((cat) => (
                          <option key={cat.slug} value={cat.slug}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="标题"
                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="描述"
                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
                      />
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) =>
                          setEditSortOrder(parseInt(e.target.value) || 0)
                        }
                        placeholder="排序"
                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSaveEdit(photo.id)}
                          disabled={savingId === photo.id}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                        >
                          {savingId === photo.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {savingId === photo.id ? "保存中" : "保存"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {photo.title || "未命名"}
                      </p>
                      {photo.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {photo.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {
                            PHOTO_CATEGORIES.find(
                              (c) => c.slug === photo.category
                            )?.label
                          }
                        </span>
                        <span className="text-xs text-gray-300">#{photo.sortOrder}</span>
                      </div>
                      {/* 上传人 */}
                      {photo.author?.name && (
                        <p className="text-xs text-gray-400 mt-1">
                          上传：{photo.author.name}
                          {photo.authorId === myId && (
                            <span className="ml-1 text-blue-600">（我）</span>
                          )}
                        </p>
                      )}

                      {/* Actions：自己的照片可编辑/删除，别人的只读 */}
                      <div className="flex items-center gap-1 mt-2">
                        {isOwner || photo.authorId === myId ? (
                          <>
                            {deletingId === photo.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleDelete(photo.id)}
                                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                >
                                  确认
                                </button>
                                <button
                                  onClick={() => setDeletingId(null)}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(photo)}
                                  className="p-1 text-gray-400 hover:text-accent transition-colors"
                                  title="编辑"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => setDeletingId(photo.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                  title="删除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <span
                            className="flex items-center gap-1 text-xs text-gray-300"
                            title="只能操作自己上传的照片"
                          >
                            <Lock size={12} />
                            只读
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 加载更多 */}
        {visiblePhotos.length < filteredPhotos.length && (
          <div className="flex justify-center pb-4">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_STEP)}
              className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              加载更多（已显示 {visiblePhotos.length}/{filteredPhotos.length}）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
