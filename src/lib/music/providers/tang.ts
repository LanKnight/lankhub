import { getQqPlayUrls, searchQqSongs } from "@/lib/music-qq"

import type { MusicProvider, PlayCandidate, Track } from "../types"

/**
 * QQ 音乐（Tang 公开接口）。
 *
 * 它的价值是"网易云没有原版"的那批歌（周杰伦等），能拿到 SQ 无损。
 * 歌词能力在 P2 接入（详情接口的 `song_lyric` 字段就是标准 LRC）。
 */
export const tangProvider: MusicProvider = {
  id: "tang",
  label: "QQ 音乐（Tang）",
  capabilities: ["search", "playUrl", "cover"],
  budget: { limit: 18, windowMs: 5 * 60 * 1000, gapMs: 1200 },
  mediaHosts: ["https://*.stream.qqmusic.qq.com", "https://y.gtimg.cn"],

  async search(keyword, artist) {
    const result = await searchQqSongs(keyword, artist ?? "")
    if (!result.ok) return result
    return {
      ok: true,
      data: result.data.map((item) => ({
        apiId: item.apiId,
        title: item.title,
        artist: item.artist,
        album: item.album,
      })),
    }
  },

  async playUrls(track) {
    const result = await getQqPlayUrls(track.apiId, track.title)
    if (!result.ok) {
      // not_found = 这个源真没有；upstream = 它自己坏了（限流/5xx），要能区分
      return { candidates: [], errored: result.errorKind === "upstream" }
    }
    const candidates: PlayCandidate[] = []
    if (result.data.sq) candidates.push({ url: result.data.sq, quality: "tang-sq" })
    if (result.data.pq) candidates.push({ url: result.data.pq, quality: "tang-pq" })
    if (result.data.m4a) candidates.push({ url: result.data.m4a, quality: "tang-m4a" })
    return { candidates }
  },

  async cover(track) {
    const result = await getQqPlayUrls(track.apiId, track.title)
    return result.ok ? result.data.coverUrl : null
  },
}

export type { Track }
