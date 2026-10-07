"use client"

import { useEffect, useState } from "react"
import { Loader2, Search, X } from "lucide-react"
import { useToast } from "@/components/ui/Toast"

interface ApiSong {
  apiId: string
  title: string
  artist: string
  album: string
  picId: string
  lyricId: string
}

/** 绑定成功后回传给调用方，让它不必重新拉一次列表 */
export interface BoundInfo {
  apiId: string
  picId: string | null
  coverUrl: string | null
}

interface Props {
  song: { id: number; title: string; artist: string }
  onClose: () => void
  onBound: (info: BoundInfo) => void
}

/**
 * 单首歌的「搜索并绑定」对话框。
 *
 * 结果里**同时显示封面、专辑与歌手**，因为源站有大量冒充原唱的翻唱
 * （歌手写成「周杰伦.」这类），只看歌名根本分不出来，得靠人眼判断。
 * 所以这里的定位是「给人挑选的工具」，不做自动决定。
 */
export default function BindDialog({ song, onClose, onBound }: Props) {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState(`${song.title} ${song.artist}`.trim())
  const [results, setResults] = useState<ApiSong[]>([])
  // 进来就开始搜，所以初始就是 searching
  const [searching, setSearching] = useState(true)
  const [bindingId, setBindingId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)

  async function runSearch(query: string) {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/music/search?q=${encodeURIComponent(query)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "搜索失败", "error")
        return
      }
      setResults(data.songs ?? [])
      setRemaining(data.budget?.remaining ?? null)
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setSearching(false)
    }
  }

  /*
   * 打开时按「歌名 歌手」自动搜一次，多数情况下答案就在前几条。
   * 这里刻意不调用 runSearch —— 它开头会同步 setSearching(true)，
   * 在 effect 体里同步 setState 会触发级联渲染（lint 会拦）。
   * 放在 await 之后再改状态就没这个问题。
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const query = `${song.title} ${song.artist}`.trim()
        const res = await fetch(`/api/admin/music/search?q=${encodeURIComponent(query)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setResults(data.songs ?? [])
        setRemaining(data.budget?.remaining ?? null)
      } catch {
        // 初次自动搜索失败不打扰用户，手动点搜索即可
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [song.title, song.artist])

  async function bind(item: ApiSong) {
    setBindingId(item.apiId)
    try {
      const res = await fetch("/api/admin/music/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              songId: song.id,
              apiId: item.apiId,
              picId: item.picId,
              lyricId: item.lyricId,
              album: item.album,
            },
          ],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.bound !== 1) {
        toast(data.error || "绑定失败", "error")
        return
      }
      const warning = data.warnings?.[0]?.error
      toast(warning ? `已绑定（${warning}）` : "已绑定", warning ? "error" : "success")
      onBound({
        apiId: item.apiId,
        picId: item.picId || null,
        // 服务端把真正落库的封面地址回传过来，用它比用本地猜的准
        coverUrl: data.loaded?.[0]?.coverUrl ?? null,
      })
      onClose()
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setBindingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-20 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">
              为「{song.title}」选择正确的版本
            </p>
            <p className="truncate text-xs text-gray-400">
              本地记的是：{song.artist}
              {remaining !== null && ` · 接口配额剩余 ${remaining} 次`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-gray-100 px-5 py-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(keyword)
            }}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="歌名 或 歌名 歌手"
          />
          <button
            type="button"
            onClick={() => void runSearch(keyword)}
            disabled={searching}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">
              {searching ? "搜索中…" : "没有结果。可以换个关键词，或只搜歌名。"}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((item) => (
                <li key={item.apiId}>
                  <button
                    type="button"
                    onClick={() => void bind(item)}
                    disabled={bindingId !== null}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    {/*
                      这里刻意不显示候选封面。
                      实测搜索结果里没有封面地址字段（只有 pic_id），而封面 CDN
                      需要一段无法由 pic_id 推导的加密哈希 —— 想显示封面就只能
                      为每条候选调一次 types=pic，一次搜索十几条会瞬间吃光
                      60 次 / 5 分钟的配额。挑原版本来也不靠封面，靠歌手与专辑。
                    */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">
                      封面
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {item.artist}
                        {item.album ? ` · ${item.album}` : ""}
                      </span>
                    </span>
                    {bindingId === item.apiId && (
                      <Loader2 size={15} className="shrink-0 animate-spin text-gray-400" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-gray-100 px-5 py-3 text-xs leading-relaxed text-gray-400">
          注意：源站有大量冒充原唱的翻唱（歌手名后面加点或符号）。
          <strong className="font-medium text-gray-500">请对照歌手与专辑挑选</strong>，
          选错了前台会放出别人的翻唱。列表不显示封面是为了不额外消耗接口配额。
        </p>
      </div>
    </div>
  )
}
