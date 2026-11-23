import { searchSongs } from "@/lib/music-api"

import { PROVIDERS, SOURCE_LIST } from "./registry"
import type { ApiResult, FetchedLyrics, ProviderId, ResolvableSongLike, SourceId, Track } from "./types"

/**
 * 歌词的统一取用（**服务端专用**）。
 *
 * 以前歌词逻辑散在三处：绑定接口一段、刷新接口一段、"回网易云找歌词 id"又抄一遍。
 * 现在只有这一处规则，**先本源，再兜底**：
 *
 *  - 网易云的歌：GD（自己带 tlyric 译文）→ Meting（纯 LRC，无译文）
 *  - QQ 源的歌：Tang（详情里的 song_lyric）→ 网易云按歌名严格匹配 → 无
 *
 * 关键实测（2026-11-23 验的，别再被"要先搜一次拿 lyric_id"误导）：
 * 网易云的**曲目 id 本身就是歌词 id**，直接拿去查歌词即可；
 * 多搜一次不但白耗配额，还会因为匹配到别的版本而拿错歌词（大鱼就曾只拿到 3 行）。
 */

/** 每首歌的歌词尝试顺序 */
export const LYRIC_ORDER: Record<SourceId, ProviderId[]> = {
  netease: ["gd", "meting"],
  tencent: ["tang", "gd"],
}

const debugEnabled = process.env.MUSIC_DEBUG === "1"
const dbg = (...args: unknown[]) => {
  if (debugEnabled) console.info("[music-lyrics]", ...args)
}

/**
 * QQ 源的兜底：按「歌名 + 歌手」严格匹配网易云的某条结果，拿它的曲目 id 当歌词 id。
 * 只给 QQ 源的歌用 —— 它们没有网易云 id，只能搜。
 */
async function findNeteaseTrackBySearch(title: string, artist: string): Promise<Track | null> {
  const searched = await searchSongs(title, artist)
  if (!searched.ok) return null

  const artistKey = artist.toLowerCase().replace(/\s+/g, "")
  const hit = searched.data.find((item) => {
    const singer = item.artist.toLowerCase().replace(/\s+/g, "")
    return item.title.trim() === title.trim() && singer.includes(artistKey)
  })
  if (!hit) return null
  return { apiId: hit.apiId, title: hit.title, artist: hit.artist, lyricId: hit.lyricId ?? hit.apiId }
}

export async function fetchLyrics(
  song: Pick<ResolvableSongLike, "title" | "artist" | "apiId" | "source">,
  /** 已知的网易云歌词 id（历史数据里有），没有就用 track id */
  options: { lyricId?: string | null } = {}
): Promise<ApiResult<FetchedLyrics>> {
  const source: SourceId = song.source === "tencent" ? "tencent" : "netease"
  const reasons: string[] = []

  for (const providerId of LYRIC_ORDER[source]) {
    const provider = SOURCE_LIST.find((item) => item.id === providerId)
    if (!provider?.lyrics) continue

    let track: Track | null = {
      apiId: song.apiId,
      title: song.title,
      artist: song.artist,
      // 网易云：曲目 id 就是歌词 id，不用多搜一次
      lyricId: options.lyricId ?? song.apiId,
    }

    // QQ 源的歌没有网易云 id，兜底时按歌名严格匹配一次
    if (providerId === "gd" && source === "tencent") {
      track = await findNeteaseTrackBySearch(song.title, song.artist)
      if (!track) {
        reasons.push("网易云也没有这首歌的歌词")
        continue
      }
    }

    if (!track) continue

    const result = await provider.lyrics(track)
    if (result.ok) {
      dbg("lyrics from", providerId, song.title, result.data.translation ? "+译文" : "")
      return result
    }
    reasons.push(`${provider.label}：${result.error}`)
    dbg("lyrics failed", providerId, result.error)
  }

  return { ok: false, error: reasons[0] ?? "所有音源都没有这首歌的歌词", code: "url_unavailable" }
}

/** 只给后台「刷新歌词」用：顺带告诉调用方这是哪个源给的 */
export function lyricProviderLabel(provider: ProviderId): string {
  return PROVIDERS[provider]?.label ?? provider
}
