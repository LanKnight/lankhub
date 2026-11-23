/**
 * QQ 音乐（Tang 公共接口）客户端（**服务端专用**）。
 *
 * 为什么单独一个文件：后台绑定（后台要给一首歌选 QQ 版本）与播放解析
 * （播放时要把 song_mid 换成直链）都要用它。这个项目吃过"同一套规则抄成两份"
 * 的亏，所以搜索/详情/限流只在这里实现一次。
 *
 * 接口实测要点（详见 docs/music/第三方音乐接口大全.md）：
 *  - `msg=<关键词>` 搜索，返回数组，字段是 snake_case（song_title / singer_name / song_mid）
 *  - `msg=<歌名>&mid=<song_mid>` 取详情，含 song_play_url / _pq（无损）/ _sq（Hi-Res）
 *  - 直链是 `http://`，且带 vkey，**会失效** → 用前必须 https 化并短缓存
 *  - 偶发返回非 JSON（限流页）→ 每次请求重试一次
 */

const QQ_API = "https://tang.api.s01s.cn/music_open_api.php"
const TIMEOUT_MS = 8000

/* ---------------------------- 自限流 ---------------------------- */

const RATE_WINDOW_MS = 5 * 60 * 1000
/** 自设上限：这是公共接口，没有官方配额承诺，别把它当主力打 */
const RATE_BUDGET = 18
const CALL_GAP_MS = 1200
const calls: number[] = []
let lastAt = 0

async function takeBudget(): Promise<boolean> {
  const now = Date.now()
  while (calls.length > 0 && now - calls[0] > RATE_WINDOW_MS) calls.shift()
  if (calls.length >= RATE_BUDGET) return false

  const gap = now - lastAt
  if (gap < CALL_GAP_MS) {
    await new Promise((resolve) => setTimeout(resolve, CALL_GAP_MS - gap))
  }
  lastAt = Date.now()
  calls.push(lastAt)
  return true
}

/** 当前窗口还能发多少次（后台用来决定一次批处理几首） */
export function qqBudget(): { used: number; remaining: number } {
  const now = Date.now()
  while (calls.length > 0 && now - calls[0] > RATE_WINDOW_MS) calls.shift()
  return { used: calls.length, remaining: Math.max(0, RATE_BUDGET - calls.length) }
}

/* ---------------------------- 请求 ---------------------------- */

const debugEnabled = process.env.MUSIC_DEBUG === "1"
function dbg(...args: unknown[]) {
  if (debugEnabled) console.info("[music-qq]", ...args)
}

export type QqResult<T> = { ok: true; data: T } | { ok: false; error: string; errorKind: "not_found" | "upstream" }

/** 取 JSON，失败重试一次；返回"没找到"与"上游坏了"要分开 */
async function getJson(url: string): Promise<QqResult<unknown>> {
  let lastError = "QQ 音乐接口暂时不可用"
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await takeBudget())) {
      return { ok: false, error: "QQ 音乐接口配额已用完，请稍后再试", errorKind: "upstream" }
    }
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data !== null) return { ok: true, data }
        lastError = "QQ 音乐接口返回的不是数据（可能被限流）"
      } else {
        lastError = `QQ 音乐接口返回 ${res.status}`
      }
    } catch (error) {
      lastError = `QQ 音乐接口请求失败：${(error as Error).message.slice(0, 40)}`
    }
    dbg("retry", attempt, lastError)
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  return { ok: false, error: lastError, errorKind: "upstream" }
}

/* ---------------------------- 对外 ---------------------------- */

export interface QqSong {
  /** song_mid：QQ 的歌曲标识，存进 Song.apiId */
  apiId: string
  title: string
  artist: string
  album: string
  /** QQ 的封面（https 化后的直链） */
  coverUrl: string | null
}

interface RawQqItem {
  song_title?: unknown
  singer_name?: unknown
  album_name?: unknown
  album_title?: unknown
  song_mid?: unknown
  album_pic?: unknown
}

function toHttps(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0) return null
  return url.replace(/^http:\/\//, "https://")
}

/** 搜索：按「歌名 歌手」组合关键词，结果按同名优先排序 */
export async function searchQqSongs(title: string, artist: string): Promise<QqResult<QqSong[]>> {
  const keyword = `${title} ${artist}`.trim()
  const result = await getJson(`${QQ_API}?${new URLSearchParams({ msg: keyword, type: "json" })}`)
  if (!result.ok) return result
  if (!Array.isArray(result.data)) {
    return { ok: false, error: "QQ 音乐接口返回的数据形状不对", errorKind: "upstream" }
  }

  const songs: QqSong[] = []
  for (const raw of result.data as RawQqItem[]) {
    const apiId = String(raw?.song_mid ?? "")
    const name = String(raw?.song_title ?? "").trim()
    if (!apiId || !name) continue
    songs.push({
      apiId,
      title: name,
      artist: String(raw?.singer_name ?? "").trim(),
      album: String(raw?.album_name ?? raw?.album_title ?? "").trim(),
      coverUrl: toHttps(raw?.album_pic),
    })
  }

  return { ok: true, data: songs }
}

export interface QqPlayUrls {
  /** Hi-Res 无损 */
  sq: string | null
  /** 高品质无损 */
  pq: string | null
  /** 标准 m4a */
  m4a: string | null
  coverUrl: string | null
  /**
   * 歌词（标准 LRC）。Tang 详情里的 `song_lyric`（优先）或 `lyric`。
   * 有了它，QQ 源的歌不用再回网易云碰运气 —— 网易云常常没有这些原版的歌词。
   */
  lyric: string | null
}

/** 取详情里的播放直链（已 https 化） */
export async function getQqPlayUrls(apiId: string, title: string): Promise<QqResult<QqPlayUrls>> {
  const url = `${QQ_API}?${new URLSearchParams({ msg: title, mid: apiId, type: "json" })}`
  const result = await getJson(url)
  if (!result.ok) return result

  const raw = Array.isArray(result.data) ? result.data[0] : result.data
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "QQ 音乐接口没有返回这首歌的详情", errorKind: "not_found" }
  }
  const info = raw as Record<string, unknown>
  const pick = (field: string) => toHttps(info[field])

  const lyricRaw = typeof info.song_lyric === "string" ? info.song_lyric : typeof info.lyric === "string" ? info.lyric : ""
  // 只有时间标签没有正文的"歌词"等于没有
  const lyric = lyricRaw.replace(/\[[^\]]*\]/g, "").trim().length > 0 ? lyricRaw : null

  const urls: QqPlayUrls = {
    sq: pick("song_play_url_sq"),
    pq: pick("song_play_url_pq"),
    m4a: pick("song_play_url"),
    coverUrl: pick("album_pic"),
    lyric,
  }
  if (!urls.sq && !urls.pq && !urls.m4a) {
    return { ok: false, error: "这首歌在 QQ 音乐上也没有可播地址", errorKind: "not_found" }
  }
  return { ok: true, data: urls }
}
