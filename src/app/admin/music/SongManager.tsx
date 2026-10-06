"use client"

import { useMemo, useState } from "react"
import { Check, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { parseSongLines } from "@/lib/music"

/** 组件内部的 props 形状：调用方直接传数据即可，不必引用这个类型名 */
interface AdminSong {
  id: number
  title: string
  artist: string
  link: string | null
  favorite: boolean
}

type Mode = "single" | "bulk"

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"

export default function SongManager({ initialSongs }: { initialSongs: AdminSong[] }) {
  const { toast } = useToast()
  const [songs, setSongs] = useState<AdminSong[]>(initialSongs)
  const [mode, setMode] = useState<Mode>("single")

  // 单条添加
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [link, setLink] = useState("")
  const [favorite, setFavorite] = useState(false)
  const [saving, setSaving] = useState(false)

  // 批量粘贴
  const [bulkText, setBulkText] = useState("")
  const [importing, setImporting] = useState(false)

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ title: "", artist: "", link: "" })

  const parsed = useMemo(() => parseSongLines(bulkText), [bulkText])
  const parsedOk = parsed.filter((l) => !l.error)
  const parsedBad = parsed.filter((l) => l.error)

  /** 按歌手分组（保持首次出现的顺序），组内特别推荐在前 */
  const grouped = useMemo(() => {
    const map = new Map<string, AdminSong[]>()
    for (const song of songs) {
      const list = map.get(song.artist) ?? []
      list.push(song)
      map.set(song.artist, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title))
    }
    return [...map.entries()]
  }, [songs])

  async function refresh() {
    const res = await fetch("/api/admin/music")
    if (res.ok) setSongs(await res.json())
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !artist.trim()) {
      toast("歌名与歌手都要填", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, link, favorite }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "添加失败", "error")
        return
      }
      setSongs((prev) => [...prev, data])
      setTitle("")
      setArtist("")
      setLink("")
      setFavorite(false)
      toast("已添加", "success")
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleImport() {
    if (parsedOk.length === 0) {
      toast("没有可导入的行", "error")
      return
    }
    setImporting(true)
    try {
      const res = await fetch("/api/admin/music/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bulkText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "导入失败", "error")
        return
      }
      await refresh()
      setBulkText("")
      toast(
        `导入 ${data.created} 首${data.skipped ? `，跳过重复 ${data.skipped} 首` : ""}`,
        "success"
      )
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setImporting(false)
    }
  }

  async function patchSong(id: number, body: Partial<AdminSong>) {
    const res = await fetch(`/api/admin/music/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(data.error || "保存失败", "error")
      return false
    }
    setSongs((prev) => prev.map((s) => (s.id === id ? data : s)))
    return true
  }

  async function handleDelete(song: AdminSong) {
    if (!window.confirm(`删除「${song.title} - ${song.artist}」？`)) return
    const res = await fetch(`/api/admin/music/${song.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error || "删除失败", "error")
      return
    }
    setSongs((prev) => prev.filter((s) => s.id !== song.id))
    toast("已删除", "success")
  }

  function startEdit(song: AdminSong) {
    setEditingId(song.id)
    setDraft({ title: song.title, artist: song.artist, link: song.link ?? "" })
  }

  async function saveEdit(id: number) {
    if (!draft.title.trim() || !draft.artist.trim()) {
      toast("歌名与歌手都要填", "error")
      return
    }
    const ok = await patchSong(id, {
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      link: draft.link.trim(),
    })
    if (ok) {
      setEditingId(null)
      toast("已保存", "success")
    }
  }

  return (
    <div className="space-y-6">
      {/* 录入 */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(
            [
              ["single", "单条添加"],
              ["bulk", "批量粘贴"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`px-5 py-3 text-sm transition-colors ${
                mode === value
                  ? "text-gray-900 font-medium border-b-2 border-accent -mb-px"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <form onSubmit={handleAdd} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="song-title" className="block text-sm font-medium text-gray-700 mb-1.5">
                  歌名
                </label>
                <input
                  id="song-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder="晴天"
                />
              </div>
              <div>
                <label htmlFor="song-artist" className="block text-sm font-medium text-gray-700 mb-1.5">
                  歌手
                </label>
                <input
                  id="song-artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className={inputClass}
                  placeholder="周杰伦"
                />
              </div>
              <div>
                <label htmlFor="song-link" className="block text-sm font-medium text-gray-700 mb-1.5">
                  外链（可选）
                </label>
                <input
                  id="song-link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className={inputClass}
                  placeholder="https://y.qq.com/..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                  className="rounded border-gray-300"
                />
                特别推荐（在该歌手分组里置顶）
              </label>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                添加
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label htmlFor="bulk" className="block text-sm font-medium text-gray-700 mb-1.5">
                每行一首，格式「歌名 - 歌手」
              </label>
              <textarea
                id="bulk"
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className={`${inputClass} resize-y font-mono`}
                placeholder={"晴天 - 周杰伦\n演员 - 薛之谦\n大鱼 - 周深"}
              />
              <p className="text-xs text-gray-400 mt-1">
                也认「–」「—」「|」和制表符分隔、以及行首的 1. / - 之类的列表标记
              </p>
            </div>

            {parsed.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 flex items-center gap-3">
                  <span>解析到 {parsed.length} 行</span>
                  <span className="text-green-600">可导入 {parsedOk.length}</span>
                  {parsedBad.length > 0 && (
                    <span className="text-red-500">有问题 {parsedBad.length}</span>
                  )}
                </div>
                <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {parsed.map((line, i) => (
                    <li
                      key={`${line.raw}-${i}`}
                      className="px-4 py-2 text-sm flex items-center gap-3"
                    >
                      {line.error ? (
                        <>
                          <span className="text-red-500 shrink-0">✕</span>
                          <span className="text-gray-400 line-through truncate">{line.raw}</span>
                          <span className="text-xs text-red-500 shrink-0 ml-auto">
                            {line.error}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-green-600 shrink-0">✓</span>
                          <span className="text-gray-900 truncate">{line.title}</span>
                          <span className="text-gray-400 shrink-0">—</span>
                          <span className="text-gray-500 truncate">{line.artist}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || parsedOk.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                导入 {parsedOk.length} 首
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 已有歌单 */}
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          共 {songs.length} 首，{grouped.length} 位歌手
        </p>

        {grouped.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
            <p>还没有歌单，用上面的表单或批量粘贴加几首吧</p>
          </div>
        ) : (
          grouped.map(([artist, list]) => (
            <div key={artist} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{artist}</span>
                <span className="text-xs text-gray-400">{list.length} 首</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {list.map((song) =>
                  editingId === song.id ? (
                    <li key={song.id} className="px-5 py-3 flex flex-wrap items-center gap-2">
                      <input
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        className={`${inputClass} sm:w-48`}
                        placeholder="歌名"
                      />
                      <input
                        value={draft.artist}
                        onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
                        className={`${inputClass} sm:w-40`}
                        placeholder="歌手"
                      />
                      <input
                        value={draft.link}
                        onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                        className={`${inputClass} sm:flex-1`}
                        placeholder="外链（可选）"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(song.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        aria-label="保存"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                        aria-label="取消"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ) : (
                    <li key={song.id} className="px-5 py-2.5 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => patchSong(song.id, { favorite: !song.favorite })}
                        className={`shrink-0 p-1 rounded transition-colors ${
                          song.favorite
                            ? "text-amber-500"
                            : "text-gray-300 hover:text-amber-400"
                        }`}
                        aria-label={song.favorite ? "取消特别推荐" : "标记为特别推荐"}
                        aria-pressed={song.favorite}
                      >
                        <Star size={15} fill={song.favorite ? "currentColor" : "none"} />
                      </button>
                      <span className="text-sm text-gray-900 truncate">{song.title}</span>
                      {song.link && (
                        <a
                          href={song.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline shrink-0"
                        >
                          外链
                        </a>
                      )}
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(song)}
                          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          aria-label="编辑"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(song)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
