"use client"

import { useMemo, useState } from "react"
import {
  Check,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { bindSong, type ApiSongItem } from "@/lib/music-bind-client"
import BindDialog from "./BindDialog"
import SearchAddDialog from "./SearchAddDialog"

/**
 * 组件内部的 props 形状：调用方直接传数据即可，不必引用这个类型名。
 *
 * 在线播放相关的字段（apiId / matchStatus / coverUrl / picId）要由
 * 服务端页面 select 出来，否则这里拿不到、状态徽标全是「待绑定」。
 */
interface AdminSong {
  id: number
  title: string
  artist: string
  favorite: boolean
  apiId: string | null
  matchStatus: string | null
  coverUrl: string | null
  picId: string | null
}

/** 接口回传的一首歌：与 src/lib/music-bind-client.ts 的 ApiSongItem 同形，直接复用 */
type ApiSong = ApiSongItem

/** /api/admin/music/match 回的一条提案 */
interface Proposal {
  songId: number
  title: string
  artist: string
  matched: ApiSong | null
  confidence: "high" | "low" | "none"
  candidates: ApiSong[]
  titleMatches: ApiSong[]
  error: string | null
}

/** 按每批 n 个切分，用于把「一次最多 6 首」的绑定量分批执行 */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * 列表行里的封面缩略图。
 *
 * 只用**已入库**的 coverUrl（绑定时花 1 次配额取的），没有就显示占位方块。
 * 刻意不在这里调接口现取：官方限流 60 次 / 5 分钟，后台列表几十首歌，
 * 为了画缩略图逐条取封面会直接吃光配额 —— 而配额要留给搜索与访客播放。
 *
 * 顺带记一个坑：封面的 CDN 地址形如
 * `https://p2.music.126.net/<加密哈希>/<pic_id>.jpg`，
 * 那段哈希**无法由 pic_id 推导**（实测 p2/{picId}.jpg 与
 * p2/{picId}/{picId}.jpg 都是 404），只能靠接口给。
 */
function Cover({ src, size = 32 }: { src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      // 外部 CDN 域名不固定，用原生 img（已由 CSP 的 img-src 放行）
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      封面
    </span>
  )
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"

export default function SongManager({ initialSongs }: { initialSongs: AdminSong[] }) {
  const { toast } = useToast()
  const [songs, setSongs] = useState<AdminSong[]>(initialSongs)

  // 搜索添加
  const [searchOpen, setSearchOpen] = useState(false)

  // 手动添加（源站没收录的歌才用）
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [favorite, setFavorite] = useState(false)
  const [saving, setSaving] = useState(false)

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ title: "", artist: "" })

  // 手动搜索绑定
  const [bindTarget, setBindTarget] = useState<AdminSong | null>(null)

  // 批量自动匹配
  const [matching, setMatching] = useState(false)
  const [matchTotal, setMatchTotal] = useState(0)
  const [matchDone, setMatchDone] = useState(0)
  const [results, setResults] = useState<Proposal[] | null>(null)
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [binding, setBinding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [budget, setBudget] = useState<number | null>(null)

  const unboundCount = songs.filter((s) => !s.apiId).length
  const boundCount = songs.length - unboundCount

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
        body: JSON.stringify({ title, artist, favorite }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "添加失败", "error")
        return
      }
      setSongs((prev) => [...prev, data])
      setTitle("")
      setArtist("")
      setFavorite(false)
      toast("已添加（还没绑定，暂时不能站内播放）", "success")
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setSaving(false)
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
    setDraft({ title: song.title, artist: song.artist })
  }

  async function saveEdit(id: number) {
    if (!draft.title.trim() || !draft.artist.trim()) {
      toast("歌名与歌手都要填", "error")
      return
    }
    const ok = await patchSong(id, {
      title: draft.title.trim(),
      artist: draft.artist.trim(),
    })
    if (ok) {
      setEditingId(null)
      toast("已保存", "success")
    }
  }

  async function handleUnbind(song: AdminSong) {
    if (
      !window.confirm(
        `解绑「${song.title} - ${song.artist}」？\n解绑后这首歌在站内放不出声音，前台会置灰显示。`
      )
    ) {
      return
    }
    const res = await fetch("/api/admin/music/unbind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: [song.id] }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(data.error || "解绑失败", "error")
      return
    }
    setSongs((prev) =>
      prev.map((s) =>
        // matchStatus 不动：它是「搜过没有原版」的结论，与有没有绑定是两回事
        s.id === song.id ? { ...s, apiId: null, picId: null, coverUrl: null } : s
      )
    )
    toast("已解绑", "success")
  }

  async function handleClearAll() {
    if (boundCount === 0) return
    if (
      !window.confirm(
        `清除全部绑定？\n会把 ${boundCount} 首歌的播放 ID、封面与歌词一并清掉，全部回到「待绑定」。`
      )
    ) {
      return
    }
    setClearing(true)
    try {
      const res = await fetch("/api/admin/music/unbind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || "清除失败", "error")
        return
      }
      setSongs((prev) =>
        prev.map((s) => ({
          ...s,
          apiId: null,
          picId: null,
          coverUrl: null,
          // 同 handleUnbind：保留「源站无原版」的结论，免得下次又白搜一遍
        }))
      )
      setResults(null)
      toast(`已清除 ${data.unbound} 首的绑定`, "success")
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setClearing(false)
    }
  }

  /**
   * 批量自动匹配：分批循环调用 /match（接口一次最多 10 首，
   * 而每首要消耗 1 次第三方搜索，配额是 60 次 / 5 分钟）。
   * 只搜索、不写库，结果由下面那张面板逐条交给人确认。
   */
  async function runAutoMatch() {
    const ids = songs.filter((s) => !s.apiId).map((s) => s.id)
    if (ids.length === 0) {
      toast("没有待绑定的歌", "error")
      return
    }

    setMatching(true)
    setResults(null)
    setPicked({})
    setMatchTotal(ids.length)
    setMatchDone(0)

    const collected: Proposal[] = []
    try {
      let aborted = false
      for (const batch of chunk(ids, 10)) {
        const res = await fetch("/api/admin/music/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songIds: batch }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // 应用已经搜到的部分，而不是整批丢掉
          toast(data.error || "自动匹配中断", "error")
          aborted = true
          break
        }
        collected.push(...((data.proposals ?? []) as Proposal[]))
        if (typeof data.budget?.remaining === "number") setBudget(data.budget.remaining)
        setMatchDone((n) => n + batch.length)
      }
      setResults(collected)
      if (!aborted && collected.length > 0) {
        const hit = collected.filter((p) => p.confidence === "high").length
        toast(`匹配完成：${hit} 首找到原版，其余需要人工判断`, "success")
      }
    } catch {
      toast("网络错误，请稍后重试", "error")
      setResults(collected)
    } finally {
      setMatching(false)
    }
  }

  /**
   * 写入绑定。只传「歌名精确相同」的歌给 markNoMatch：
   * 歌名都对不上的多半是源站没收录，标了也不会误伤。
   */
  async function confirmBinds(items: { songId: number; item: ApiSong }[], noMatchIds: number[]) {
    if (items.length === 0 && noMatchIds.length === 0) {
      toast("没有可绑定的项", "error")
      return
    }
    setBinding(true)
    try {
      let boundCount = 0
      const failedIds = new Set<number>()
      const coverBySong = new Map<number, string | null>()
      let warningCount = 0

      /*
       * 每首单独调 bindSong，而不是把 6 首塞进一个请求。
       * 为什么值得多几次往返：/bind 现在会为每个 item 校验「这个版本是否
       * 来自当前搜索结果」，逐首调用能拿到**每首歌自己的**失败原因与封面，
       * 而不是一坨混在一起的结果 —— 批量失败时最容易在这里说不清。
       */
      for (const { songId, item } of items) {
        const result = await bindSong(songId, item)
        if (!result.ok) {
          failedIds.add(songId)
          toast(`「${item.title}」绑定失败：${result.error}`, "error")
          continue
        }
        boundCount += 1
        coverBySong.set(songId, result.coverUrl)
        if (result.warning) warningCount += 1
      }
      if (warningCount > 0) {
        toast(`${warningCount} 首歌的封面或歌词没抓到，不影响播放`, "error")
      }

      // 没匹配上的标记成「无原版」，下次自动匹配就不再白搜这些歌
      if (noMatchIds.length > 0) {
        await fetch("/api/admin/music/bind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [], markNoMatch: noMatchIds }),
        }).catch(() => null)
      }

      const boundIds = items
        .map((i) => i.songId)
        .filter((id) => !failedIds.has(id))
      const noMatchSet = new Set(noMatchIds)

      setSongs((prev) =>
        prev.map((s) => {
          if (boundIds.includes(s.id)) {
            const item = items.find((i) => i.songId === s.id)?.item
            return {
              ...s,
              apiId: item?.apiId ?? s.apiId,
              picId: item?.picId ?? s.picId,
              coverUrl: coverBySong.get(s.id) ?? s.coverUrl,
              matchStatus: null,
            }
          }
          if (noMatchSet.has(s.id)) return { ...s, matchStatus: "nomatch" }
          return s
        })
      )

      // 结果面板里已经处理掉的条目就移除，剩下的继续让人确认
      setResults((prev) =>
        prev
          ? prev.filter(
              (p) => !boundIds.includes(p.songId) && !noMatchSet.has(p.songId)
            )
          : prev
      )

      toast(
        `已绑定 ${boundCount} 首` +
          (noMatchIds.length > 0 ? `，标记无原版 ${noMatchIds.length} 首` : "") +
          (failedIds.size > 0 ? `，失败 ${failedIds.size} 首` : ""),
        failedIds.size > 0 ? "error" : "success"
      )
    } catch {
      toast("网络错误，请稍后重试", "error")
    } finally {
      setBinding(false)
    }
  }

  /**
   * 确认面板里的一键绑定：高置信度的，加上用户手动挑过的。
   *
   * 「源站无原版」只标给**歌名相同但全是翻唱**的那些（titleMatches 非空）——
   * 那才是有把握的结论。连歌名都搜不到的（titleMatches 为空，多半是歌名带
   * 括号或源站没收录）一律**不标记**，免得以后换个关键词也永远不再搜它。
   */
  function handleConfirmAll() {
    if (!results) return
    const items: { songId: number; item: ApiSong }[] = []
    const noMatchIds: number[] = []

    for (const p of results) {
      const manualId = picked[p.songId]
      if (manualId) {
        const item = p.candidates.find((c) => c.apiId === manualId)
        if (item) items.push({ songId: p.songId, item })
        continue
      }
      if (p.confidence === "high" && p.matched) {
        items.push({ songId: p.songId, item: p.matched })
      }
    }
    void confirmBinds(items, noMatchIds)
  }

  const pickableResults = results?.filter((p) => pickCount(p) > 0).length ?? 0

  function pickCount(p: Proposal) {
    return p.confidence === "high" || picked[p.songId] ? 1 : 0
  }

  /**
   * 歌名相同、但候选歌手全对不上的那些 —— 可以断定「源站只有翻唱」。
   * 用 useMemo 是因为它在渲染里被读了好几次，没必要每处都过滤一遍。
   */
  const noMatchList = useMemo(
    () =>
      (results ?? []).filter(
        (p) => !picked[p.songId] && p.confidence !== "high" && p.titleMatches.length > 0
      ),
    [results, picked]
  )

  /** 手动把「只有翻唱」的那些标成无原版，下次自动匹配不再重复搜 */
  function handleMarkNoMatch() {
    if (noMatchList.length === 0) return
    if (
      !window.confirm(
        `把这 ${noMatchList.length} 首标成「源站无原版」？\n它们的歌名在源站能搜到，但歌手全对不上（多半是翻唱）。\n标记后自动匹配不会再搜它们。`
      )
    ) {
      return
    }
    void confirmBinds(
      [],
      noMatchList.map((p) => p.songId)
    )
  }

  return (
    <div className="space-y-6">
      {/* 录入 */}
      <div className="bg-white rounded-xl border border-gray-100">
        {/*
          主入口是「搜索添加」：搜到的结果自带歌手、专辑、封面与歌词，
          不用手工录歌手，也不用自己分类。
          手动添加只是退路 —— 专门留给源站确实没收录的歌。
        */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">搜索添加</p>
            <p className="mt-0.5 text-xs text-gray-400">
              搜歌名（可带上歌手）→ 挑一个版本 → 加入歌单。
              歌手、专辑、封面与歌词都由搜索结果带出来，不用手工录
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <Search size={16} />
            搜索添加
          </button>
        </div>

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-gray-500 transition-colors hover:text-gray-900">
            <Plus size={14} className="shrink-0" />
            手动添加（源站没收录的歌用这个）
            <span className="text-xs text-gray-300 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <form onSubmit={handleAdd} className="space-y-4 border-t border-gray-100 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
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
            <p className="text-xs text-gray-400">
              这里加的只是歌名与歌手，暂时不能站内播放；
              之后用工具栏的「自动匹配未绑定的歌」或行内的「搜索绑定」把它绑上
            </p>
          </form>
        </details>
      </div>

      {/* 在线播放的工具条 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-100 bg-white px-5 py-3">
        <span className="text-sm text-gray-500">
          共 {songs.length} 首 · {grouped.length} 位歌手 · 已绑定 {boundCount} 首
          {unboundCount > 0 && <span className="text-gray-400">（待绑定 {unboundCount}）</span>}
        </span>

        <span className="ml-auto text-xs text-gray-400">
          {budget !== null ? `接口配额剩余 ${budget} 次` : "配额在第一次调用后显示"}
        </span>

        <button
          type="button"
          onClick={() => void runAutoMatch()}
          disabled={matching || unboundCount === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
        >
          {matching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          自动匹配未绑定的歌
        </button>

        <button
          type="button"
          onClick={() => void handleClearAll()}
          disabled={clearing || boundCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-colors hover:text-red-500 disabled:opacity-50"
        >
          {clearing ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
          清除全部绑定
        </button>
      </div>

      {/* 批量匹配的进度 */}
      {matching && (
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-sm text-gray-600">
            正在搜索原版… {matchDone} / {matchTotal}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${matchTotal ? (matchDone / matchTotal) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            每首要花 1 次第三方搜索，接口限流 60 次 / 5 分钟，请稍等
          </p>
        </div>
      )}

      {/* 批量匹配结果：逐条让人确认，确认前不写库 */}
      {results && results.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
            <span className="text-sm font-semibold text-gray-800">自动匹配结果</span>
            <span className="text-xs text-gray-400">
              共 {results.length} 条 · 找到原版{" "}
              {results.filter((p) => p.confidence === "high").length} 条 ·
              需要人工判断 {results.filter((p) => p.confidence !== "high").length} 条
            </span>
            <button
              type="button"
              onClick={() => setResults(null)}
              className="ml-auto p-1.5 text-gray-400 transition-colors hover:text-gray-900"
              aria-label="关闭结果面板"
            >
              <X size={15} />
            </button>
          </div>

          <ul className="divide-y divide-gray-100">
            {results.map((p) => {
              const manualId = picked[p.songId]
              const selected =
                p.candidates.find((c) => c.apiId === manualId) ??
                (p.confidence === "high" ? p.matched : null)
              const willSkip = !selected

              return (
                <li key={p.songId} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 左边：我记的歌 */}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">{p.title}</p>
                      <p className="truncate text-xs text-gray-400">{p.artist}</p>
                    </div>

                    <span className="shrink-0 text-gray-300">→</span>

                    {/* 中间：选中的版本 */}
                    {selected ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-900">
                            {selected.title}
                            {selected.album && (
                              <span className="text-gray-400">（{selected.album}）</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-gray-500">{selected.artist}</p>
                        </div>
                        {p.confidence === "high" && !manualId && (
                          <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                            歌名歌手都对得上
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm text-amber-600">
                          <TriangleAlert size={14} className="shrink-0" />
                          {p.error
                            ? `搜索失败：${p.error}`
                            : p.titleMatches.length > 0
                              ? "只有翻唱，源站没有原版"
                              : "没找到这首歌"}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {p.titleMatches.length > 0
                            ? `歌名相同的 ${p.titleMatches.length} 条歌手都对不上，多半是翻唱`
                            : "建议补一个外链，前台会显示「去别处听」"}
                        </p>
                      </div>
                    )}

                    {/* 右边：操作 */}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {p.candidates.length > 0 && (
                        <select
                          value={manualId ?? ""}
                          onChange={(e) =>
                            setPicked((prev) => ({ ...prev, [p.songId]: e.target.value }))
                          }
                          className="max-w-[13rem] rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-accent"
                          aria-label={`为「${p.title}」换一个版本`}
                        >
                          <option value="">换一个…</option>
                          {p.candidates.map((c) => (
                            <option key={c.apiId} value={c.apiId}>
                              {c.title} — {c.artist}
                              {c.album ? `（${c.album}）` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setBindTarget(songById(p.songId))}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
                      >
                        <Search size={12} />
                        手动搜
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setResults((prev) =>
                            prev ? prev.filter((x) => x.songId !== p.songId) : prev
                          )
                        }
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-900"
                        aria-label="先跳过这条"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {willSkip && p.titleMatches.length > 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      歌名相同的候选歌手全对不上，多半是翻唱；要点下面的
                      「标记无原版」才会记下来，不会动它现在的外链
                    </p>
                  )}
                  {willSkip && p.titleMatches.length === 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      连歌名都没搜到，可能歌名里带了括号或源站没收录。
                      这里不会把它标成无原版，方便你以后再搜
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
            <span className="text-xs text-gray-500">
              将写入 {pickableResults} 首
              {noMatchList.length > 0 && (
                <span className="text-gray-400">
                  · 另有 {noMatchList.length} 首只有翻唱
                </span>
              )}
            </span>

            {/*
              刻意不把「只有翻唱」自动带进写入：标记是可逆性差的操作
              （标了以后自动匹配就不再搜它），得由人点一下才算数
            */}
            {noMatchList.length > 0 && (
              <button
                type="button"
                onClick={handleMarkNoMatch}
                disabled={binding}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
              >
                <TriangleAlert size={13} />
                标记无原版
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={binding || pickableResults === 0}
              className={`${
                noMatchList.length > 0 ? "" : "ml-auto "
              }inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50`}
            >
              {binding ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              确认并写入 {pickableResults} 首
            </button>
          </div>
        </div>
      )}

      {/* 已有歌单 */}
      <div className="space-y-4">
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

                      <Cover src={song.coverUrl} size={32} />

                      <span className="text-sm text-gray-900 truncate">{song.title}</span>

                      {/* 绑定状态徽标：已绑定 / 无原版 / 待绑定 */}
                      {song.apiId ? (
                        <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                          已绑定
                        </span>
                      ) : song.matchStatus === "nomatch" ? (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                          源站无原版
                        </span>
                      ) : (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-400 ring-1 ring-gray-200">
                          待绑定
                        </span>
                      )}

                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {song.apiId ? (
                          <button
                            type="button"
                            onClick={() => void handleUnbind(song)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-colors hover:text-gray-900"
                            aria-label={`解绑「${song.title}」`}
                          >
                            <Unlink size={13} />
                            解绑
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBindTarget(song)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent/5"
                            aria-label={`为「${song.title}」搜索并绑定`}
                          >
                            <Link2 size={13} />
                            搜索绑定
                          </button>
                        )}
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

      {searchOpen && (
        <SearchAddDialog
          onClose={() => setSearchOpen(false)}
          onAdded={(info) => {
            // 已存在的歌只更新播放字段，不重复插一条
            setSongs((prev) => {
              const hit = prev.find((s) => s.id === info.songId)
              if (hit) {
                return prev.map((s) =>
                  s.id === info.songId
                    ? {
                        ...s,
                        apiId: info.apiId ?? s.apiId,
                        coverUrl: info.coverUrl ?? s.coverUrl,
                        matchStatus: info.apiId ? null : s.matchStatus,
                      }
                    : s
                )
              }
              // 新加的歌：服务端只回了 id，这里先按已知信息插进去，
              // 之后刷新页面即可拿到完整字段
              return [
                ...prev,
                {
                  id: info.songId,
                  title: info.title,
                  artist: info.artist,
                  favorite: false,
                  apiId: info.apiId,
                  matchStatus: null,
                  coverUrl: info.coverUrl,
                  picId: null,
                },
              ]
            })
          }}
        />
      )}

      {bindTarget && (
        <BindDialog
          song={{ id: bindTarget.id, title: bindTarget.title, artist: bindTarget.artist }}
          onClose={() => setBindTarget(null)}
          onBound={(info) => {
            setSongs((prev) =>
              prev.map((s) =>
                s.id === bindTarget.id
                  ? {
                      ...s,
                      apiId: info.apiId,
                      picId: info.picId,
                      coverUrl: info.coverUrl ?? s.coverUrl,
                      matchStatus: null,
                    }
                  : s
              )
            )
            // 已经手动绑上了，就从待确认的结果里划掉
            setResults((prev) =>
              prev ? prev.filter((p) => p.songId !== bindTarget.id) : prev
            )
          }}
        />
      )}
    </div>
  )

  function songById(id: number): AdminSong {
    return (
      songs.find((s) => s.id === id) ?? {
        id,
        title: "",
        artist: "",
        favorite: false,
        apiId: null,
        matchStatus: null,
        coverUrl: null,
        picId: null,
      }
    )
  }
}
