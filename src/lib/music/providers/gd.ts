import {
  getCoverUrl,
  getGdPlayUrl,
  getLyricWithTranslation,
  searchSongs,
} from "@/lib/music-api"

import type { MusicProvider, PlayCandidate, Track } from "../types"

/**
 * GD 音乐台（网易云线路）。
 *
 * 能力最全：搜索 / 播放地址（999→740→320 降档）/ 封面 / 歌词（含 tlyric 译文）。
 * 限流在 music-api.ts 内部还有一道 45 次/5 分钟的历史闸门，这里不重复拦截，
 * 只把它作为"声明"写进 registry，供后台面板展示。
 */
export const gdProvider: MusicProvider = {
  id: "gd",
  label: "网易云（GD音乐台）",
  capabilities: ["search", "playUrl", "cover", "lyric"],
  budget: { limit: 45, windowMs: 5 * 60 * 1000, gapMs: 400 },
  mediaHosts: ["https://*.music.126.net"],

  async search(keyword, artist) {
    const result = await searchSongs(keyword, artist)
    if (!result.ok) return result
    return {
      ok: true,
      data: result.data.map((item) => ({
        apiId: item.apiId,
        title: item.title,
        artist: item.artist,
        album: item.album,
        picId: item.picId,
        lyricId: item.lyricId,
      })),
    }
  },

  /** 从最高音质开始要，拿不到就降档；任一档拿到就停 */
  async playUrls(track) {
    for (const br of ["999", "740", "320"] as const) {
      const result = await getGdPlayUrl(track.apiId, br)
      if (result.ok && result.data) {
        return { candidates: [{ url: result.data, quality: `gd-${br}` }] }
      }
      // "这个档位没有"是正常的（降档再试）；其它错误说明源出了问题
      if (!result.ok && result.code !== "url_unavailable") {
        return { candidates: [], errored: true }
      }
    }
    return { candidates: [] }
  },

  async cover(track) {
    if (!track.picId) return null
    const result = await getCoverUrl(track.picId)
    return result.ok ? result.data : null
  },

  async lyrics(track) {
    if (!track.lyricId) {
      return { ok: false, error: "这首歌没有歌词 id", code: "url_unavailable" }
    }
    const result = await getLyricWithTranslation(track.lyricId)
    if (!result.ok) return result
    return {
      ok: true,
      data: { lyric: result.data.lyric, translation: result.data.translation, provider: "gd" },
    }
  },
}
