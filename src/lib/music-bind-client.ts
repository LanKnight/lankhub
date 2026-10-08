/**
 * 绑定一首歌到音乐接口 —— 后台两个对话框（单首绑定 / 搜索添加）共用的客户端逻辑。
 *
 * 为什么抽出来：绑定要处理「封面或歌词抓取失败但绑定本身成功」这种情况，
 * 两个地方各写一遍迟早会不一致。服务端那边也一样（/bind 是同一个接口）。
 */

import { matchSong } from "@/lib/music-match"

/** 与 src/lib/music-api.ts 的 ApiSong 同形 */
export interface ApiSongItem {
  apiId: string
  title: string
  artist: string
  album: string
  picId: string
  lyricId: string
}

export interface BindResult {
  ok: boolean
  error?: string
  coverUrl: string | null
  /** 封面或歌词抓取失败时的提示（绑定本身仍然成功） */
  warning?: string
}

interface BindResponse {
  bound: number
  loaded?: { songId: number; coverUrl: string | null; lyric: boolean }[]
  failed?: { songId: number; error: string }[]
  warnings?: { songId: number; error: string }[]
  error?: string
}

/**
 * 把某首歌绑到指定的版本（`item.apiId` 是**客户端说了算**的）。
 *
 * 注意：服务端会先用搜索结果校验这个 apiId 确实是这首歌的合理版本
 * （理由是防止歌名歌手被改过之后、旧对话框还拿着过期结果提交），
 * 因此这里传的 item 必须是搜索接口刚返回的结果。
 */
export async function bindSong(songId: number, item: ApiSongItem): Promise<BindResult> {
  try {
    const res = await fetch("/api/admin/music/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            songId,
            apiId: item.apiId,
            picId: item.picId,
            lyricId: item.lyricId,
            album: item.album,
          },
        ],
      }),
    })
    const data: BindResponse = await res.json().catch(() => ({ bound: 0 }))

    if (!res.ok || data.bound !== 1) {
      const failedHere = data.failed?.find((f) => f.songId === songId)?.error
      return {
        ok: false,
        error: failedHere || data.error || "绑定失败",
        coverUrl: null,
      }
    }

    /*
     * 按 songId 查，不要用 loaded[0]。
     * /bind 会在处理 items 之前先处理 markNoMatch，且 loaded 是跨请求累积的 ——
     * 用下标取会拿到别的歌的封面。
     */
    return {
      ok: true,
      coverUrl: data.loaded?.find((l) => l.songId === songId)?.coverUrl ?? null,
      warning: data.warnings?.find((w) => w.songId === songId)?.error,
    }
  } catch {
    return { ok: false, error: "网络错误，请稍后重试", coverUrl: null }
  }
}

/**
 * 版本漂移兜底：手动挑的那个版本后来搜不到了（下架 / 改名）时，
 * 按保守规则从当前结果里挑一个替代版本。
 *
 * 只在**没有可信候选、但有歌名精确相同**的条目时才兜底，
 * 因为那种情况下源站本来就没有原版（如网易云无周杰伦版权），
 * 与其让作者重复点击，不如直接用他点的那条。返回 null 表示不兜底。
 */
export function pickFallback(candidates: ApiSongItem[], title: string, artist: string) {
  const outcome = matchSong(candidates, title, artist)
  if (outcome.confidence === "high" || outcome.titleMatches.length === 0) return null
  return outcome.titleMatches[0]
}
