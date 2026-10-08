"use client"

import { useState } from "react"
import { Check, Loader2, Music4, Plus, Search, TriangleAlert, X } from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { bindSong, type ApiSongItem } from "@/lib/music-bind-client"

/** 「只加入歌单」按钮的悬停说明 */
const NOT_PLAYABLE_HINT = "只加入歌单，先不绑定（这首歌暂时不能站内播放）"

/** /api/admin/music/search 回的一条结果 */
interface SearchItem {
  apiId: string
  title: string
  artist: string
  album: string
  picId: string
  lyricId: string
  /** 歌名精确相同、且歌手也对得上 —— 即「可以直接绑」；null = 没输歌手、无从比对 */
  credible: boolean | null
  /** 歌名是否精确相同 */
  titleExact: boolean
  /** 同名同歌手是否已在歌单里 */
  inLibrary: boolean
  /** 这个版本是否就是当前已绑定的那个 */
  bound: boolean
}

interface Props {
  onClose: () => void
  /** 添加（并可能绑定）成功，通知父组件更新列表 */
  onAdded: (info: {
    songId: number
    existed: boolean
    apiId: string | null
    coverUrl: string | null
    title: string
    artist: string
  }) => void
}

/**
 * 后台的「搜索添加」：直接搜歌 → 挑一个版本 → 加入歌单（可选同时绑定）。
 *
 * 与老的「粘贴导入」相比，这里的好处是不用手工录歌手、也不用手工分类：
 * 歌手、专辑、封面、歌词都由搜索结果的 ID 带出来。
 *
 * 两个刻意的设计：
 *  1. **结果全部显示**，只给歌手对不上的那些标「疑似翻唱」——
 *     选哪个版本由人决定，代码不替用户过滤掉选项。
 *  2. **没有想要的版本就什么都不点**，不会留下半条记录。
 */
export default function SearchAddDialog({ onClose, onAdded }: Props) {
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [results, setResults] = useState<SearchItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  /** 本次对话框里已加入歌单的条数，用来提示「还可以继续搜」 */
  const [addedCount, setAddedCount] = useState(0)

  async function runSearch() {
    if (!title.trim()) {
      toast("请先填歌名", "error")
      return
    }
    setSearching(true)
    try {
      const query = new URLSearchParams({ q: title.trim() })
      if (artist.trim()) query.set("artist", artist.trim())
      const res = await fetch(`/api/admin/music/search?${query.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "搜索失败", "error")
        setResults([])
        return
      }
      /*
       * 按「最可能是原版」排序：歌名精确相同且歌手可信的排最前，
       * 其次歌手可信但歌名带后缀的（如「晴天(深情版)」），再次才是歌手对不上的。
       * 这样「添加并绑定」点第一个通常就是对的，
       * 但**排序不会隐藏任何选项**，翻唱照样列在下面由你自己选。
       */
      const list: SearchItem[] = data.songs ?? []
      const score = (s: SearchItem) =>
        (s.credible === true ? 2 : 0) + (s.titleExact ? 1 : 0)
      setResults([...list].sort((a, b) => score(b) - score(a)))
      if (typeof data.budget?.remaining === "number") setRemaining(data.budget.remaining)
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setSearching(false)
    }
  }

  /**
   * 先建记录再（可选）绑定。
   *
   * 分成两步是为了复用已有的 /bind —— 它已经处理好了抓封面、抓歌词、
   * 以及「封面失败不阻断绑定」。这里没必要再写一遍同样的逻辑。
   */
  async function addItem(item: SearchItem, alsoBind: boolean) {
    setBusyId(item.apiId)
    try {
      const addRes = await fetch("/api/admin/music/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, artist: item.artist }),
      })
      const addData = await addRes.json().catch(() => ({}))
      if (!addRes.ok || typeof addData.songId !== "number") {
        toast(addData.error || "添加失败", "error")
        return
      }

      let coverUrl: string | null = null
      if (alsoBind) {
        const item_: ApiSongItem = {
          apiId: item.apiId,
          title: item.title,
          artist: item.artist,
          album: item.album,
          picId: item.picId,
          lyricId: item.lyricId,
        }
        const bind = await bindSong(addData.songId, item_)
        if (!bind.ok) {
          // 记录已经建好了，只是没绑上 —— 如实说明，别让用户以为整条都失败
          const prefix = addData.existed ? "这首歌已在歌单" : "已加入歌单"
          toast(`${prefix}，但绑定失败：${bind.error}`, "error")
          onAdded({
            songId: addData.songId,
            existed: true,
            apiId: null,
            coverUrl: null,
            title: item.title,
            artist: item.artist,
          })
          return
        }
        coverUrl = bind.coverUrl
        const prefix = addData.existed ? "已绑定到这个版本" : "已添加并绑定"
        toast(bind.warning ? `${prefix}（${bind.warning}）` : prefix, bind.warning ? "error" : "success")
      } else {
        toast(addData.existed ? "这首歌已在歌单里了" : "已加入歌单（未绑定）", "success")
      }

      setAddedCount((n) => n + 1)
      onAdded({
        songId: addData.songId,
        existed: addData.existed,
        apiId: alsoBind ? item.apiId : null,
        coverUrl,
        title: item.title,
        artist: item.artist,
      })

      // 这条已经处理过，直接从结果里划掉，避免重复点
      setResults((prev) => prev?.filter((x) => x.apiId !== item.apiId) ?? prev)
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-16 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">搜索添加</p>
            <p className="text-xs text-gray-400">
              搜到想要的版本就点「添加并绑定」；没有想要的版本就什么都不点
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

        {/* 搜索条件 */}
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
            className="min-w-[10rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="歌名（必填）"
            aria-label="歌名"
          />
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
            className="min-w-[8rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="歌手（可选，填了更准）"
            aria-label="歌手"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
        </div>

        {/* 结果 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {results === null ? (
            <p className="px-5 py-14 text-center text-sm text-gray-400">
              填好歌名后点「搜索」。填上歌手会让原版更容易排在前面。
            </p>
          ) : results.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-gray-400">
              没有结果。可以只搜歌名、或换个写法再试。
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((item) => {
                const busy = busyId === item.apiId
                /*
                 * 只在「歌名就是你搜的那首、但歌手对不上」时标「疑似翻唱」。
                 * 歌名都不一样的条目不用标 —— 那一眼就看得出不是同一首，
                 * 标满了反而让徽标失去意义（实测搜「晴天」会混进《刀马旦》）。
                 */
                const suspect = item.credible === false && item.titleExact
                return (
                  <li
                    key={item.apiId}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-900">
                        <span className="truncate">{item.title}</span>
                        {suspect && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                            <TriangleAlert size={10} />
                            疑似翻唱
                          </span>
                        )}
                        {item.inLibrary && (
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                            已在歌单
                          </span>
                        )}
                        {item.bound && (
                          <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                            已绑定
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {item.artist}
                        {item.album ? ` · ${item.album}` : ""}
                      </p>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void addItem(item, true)}
                        disabled={busyId !== null}
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        添加并绑定
                      </button>
                      <button
                        type="button"
                        onClick={() => void addItem(item, false)}
                        disabled={busyId !== null}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-50"
                        title={NOT_PLAYABLE_HINT}
                      >
                        <Plus size={12} />
                        只加入歌单
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <Music4 size={13} className="shrink-0" />
            {addedCount > 0
              ? `本次已处理 ${addedCount} 首 · 可以改个歌名继续搜`
              : "「添加并绑定」每首约消耗 4 次接口配额（搜索 + 校验版本 + 封面 + 歌词），官方限流是 60 次 / 5 分钟"}
          </p>
        </div>
      </div>
    </div>
  )
}
