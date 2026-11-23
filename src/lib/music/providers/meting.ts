import type { MusicProvider, PlayCandidate } from "../types"

const BASE = "https://api.injahow.cn/meting/"
const TIMEOUT_MS = 8000

/**
 * Meting 公共实例（网易云 id 的另一条线路）。
 *
 * 两个要点（都是实测踩出来的）：
 *  - `type=url` **直接回音频流**（开头是 ID3），不是 JSON —— 所以它本身就是可播地址，
 *    交给 probeAudio 验证即可，不需要解析响应体。
 *  - `type=lrc` 回**纯 LRC 文本**（不是 JSON），可做歌词的最后兜底。
 */
export const metingProvider: MusicProvider = {
  id: "meting",
  label: "Meting 备用线路",
  capabilities: ["playUrl", "lyric"],
  budget: { limit: 30, windowMs: 5 * 60 * 1000, gapMs: 400 },
  mediaHosts: ["https://api.injahow.cn"],

  async playUrls(track) {
    // 只对网易云 id 有意义（Meting 按 id 取流）
    if (!/^\d+$/.test(track.apiId)) return { candidates: [] }
    return {
      candidates: [{ url: `${BASE}?type=url&id=${encodeURIComponent(track.apiId)}`, quality: "meting" }],
    }
  },

  async lyrics(track) {
    if (!/^\d+$/.test(track.apiId)) {
      return { ok: false, error: "Meting 只支持网易云 id", code: "url_unavailable" }
    }
    try {
      const res = await fetch(
        `${BASE}?server=netease&type=lrc&id=${encodeURIComponent(track.apiId)}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { "user-agent": "Mozilla/5.0" },
        }
      )
      if (!res.ok) return { ok: false, error: `Meting 歌词接口返回 ${res.status}`, code: "upstream_error" }
      const text = await res.text()
      // 歌词必须是 LRC 形态；HTML 错误页要当上游异常，不能当"没歌词"
      if (!text.trimStart().startsWith("[")) {
        return { ok: false, error: "Meting 歌词接口返回的不是 LRC", code: "upstream_error" }
      }
      return { ok: true, data: { lyric: text, translation: null, provider: "meting" } }
    } catch (error) {
      return { ok: false, error: `Meting 歌词请求失败：${(error as Error).message.slice(0, 40)}`, code: "upstream_error" }
    }
  },
}
