import type { ApiSongItem } from "@/lib/music-bind-client"

/**
 * 后台歌单管理的共享类型与纯函数。
 *
 * 从 SongManager.tsx（原来 1000+ 行）里拆出来，让"数据形状"和"界面逻辑"分开，
 * 其他组件（MatchPanel / SongRow）也能直接引用，不必重复声明。
 */

export interface AdminSong {
  id: number
  title: string
  artist: string
  favorite: boolean
  apiId: string | null
  /** 音源：netease（网易云经 GD）或 tencent（QQ 音乐）。界面新建的临时行可能没有 */
  source?: string | null
  matchStatus: string | null
  coverUrl: string | null
  picId: string | null
}

/** 接口回传的一首歌：与 src/lib/music-bind-client.ts 的 ApiSongItem 同形，直接复用 */
export type ApiSong = ApiSongItem

/** /api/admin/music/match 回的一条提案 */
export interface Proposal {
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
export function chunk<T>(list: T[], size: number): T[][] {
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
export const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
