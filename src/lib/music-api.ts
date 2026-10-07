/**
 * GD音乐台 API 客户端（**服务端专用**，不要在客户端 import）。
 *
 * 为什么必须有这层代理：那个 JSON 接口没有 CORS 头，浏览器直接 fetch 会被拦。
 * 而 `<audio src>` 与 `<img>` 不受同源策略约束，音频与封面可以直连 CDN。
 *
 * 实测结论（详见 docs/music-plan.md，都是真跑出来的，不是照抄文档）：
 *  - 只有 netease 是真正能播的音源。kuwo 被服务端以 400 拒绝，
 *    joox 能搜到但 types=url 恒返回空链接，其余音源全部不支持。
 *    → 所以这里**不做多音源轮询**，失败就在 netease 上重试，
 *      不去浪费配额试那些已知不可用的音源。
 *  - 播放地址是短时签名（URL 里带时间戳），不能存库，只能短缓存。
 *  - 官方限流 60 次 / 5 分钟 → 调用点要少，所以封面与歌词在绑定时就入库，
 *    运行期只剩「取播放地址」这一个调用。
 */

const API_BASE = "https://music-api.gdstudio.xyz/api.php"
/** 唯一可用的音源 */
export const MUSIC_SOURCE = "netease"
const TIMEOUT_MS = 8000

/** 播放地址的缓存时长。签名 URL 有有效期，所以只短缓存 */
const PLAY_URL_TTL_MS = 10 * 60 * 1000
/** 缓存条目上限，避免长时间运行后无限增长 */
const PLAY_URL_CACHE_MAX = 500

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** 搜索结果里我们需要的字段 */
export interface ApiSong {
  apiId: string
  title: string
  artist: string
  album: string
  picId: string
  lyricId: string
}

interface RawSearchItem {
  id?: string
  name?: string
  artist?: string[]
  album?: string
  pic_id?: string
  url_id?: string
  lyric_id?: string
}

const playUrlCache = new Map<string, { url: string; expiresAt: number }>()

/*
 * 自我配额：官方限流是 60 次 / 5 分钟。
 *
 * 为什么要在自己这边也设一道闸门：批量匹配每首歌要「1 次搜索 + 2 次抓取」，
 * 几十首歌一轮下来就会把配额打光。打光之后不只是被服务端拒绝，
 * 也违背了对方「请勿高频请求」的要求。所以自己最多用 45 次，
 * 给访客的播放请求留出余量，用完就明确拒绝、而不是硬撞上去。
 */
const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_BUDGET = 45
const recentCalls: number[] = []

function pruneRecentCalls(now: number) {
  while (recentCalls.length > 0 && now - recentCalls[0] > RATE_WINDOW_MS) {
    recentCalls.shift()
  }
}

/** 当前窗口内还能发多少次请求。后台用它决定一次批处理几首 */
export function musicApiBudget(): { used: number; remaining: number } {
  pruneRecentCalls(Date.now())
  return {
    used: recentCalls.length,
    remaining: Math.max(0, RATE_BUDGET - recentCalls.length),
  }
}

/** 统一的请求封装：带超时、统一错误文案，绝不把底层异常抛给调用方 */
async function callApi(params: Record<string, string>): Promise<ApiResult<unknown>> {
  const now = Date.now()
  pruneRecentCalls(now)
  if (recentCalls.length >= RATE_BUDGET) {
    return {
      ok: false,
      error: "音乐接口的调用配额快用完了，请过几分钟再试",
    }
  }
  recentCalls.push(now)

  const query = new URLSearchParams({ ...params, source: params.source ?? MUSIC_SOURCE })
  const url = `${API_BASE}?${query.toString()}`

  try {
    const res = await fetch(url, {
      // 这个接口不稳定，不能让 Next 把失败结果也缓存住
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    })

    if (!res.ok) {
      return { ok: false, error: `音乐接口返回 ${res.status}` }
    }

    return { ok: true, data: await res.json() }
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "音乐接口响应超时"
        : "音乐接口暂时无法访问"
    return { ok: false, error: reason }
  }
}

/** 搜索歌曲。只用于后台绑定，前台不开放搜索 */
export async function searchSongs(keyword: string): Promise<ApiResult<ApiSong[]>> {
  const result = await callApi({ types: "search", name: keyword })
  if (!result.ok) return result

  const list = Array.isArray(result.data) ? (result.data as RawSearchItem[]) : []
  const songs = list
    // url_id 缺失的记录没法播放，直接过滤掉
    .filter((item) => item.url_id && item.name)
    .map((item) => ({
      apiId: String(item.url_id),
      title: String(item.name ?? ""),
      artist: Array.isArray(item.artist) ? item.artist.join(" / ") : "",
      album: String(item.album ?? ""),
      picId: String(item.pic_id ?? ""),
      lyricId: String(item.lyric_id ?? ""),
    }))

  return { ok: true, data: songs }
}

/**
 * 取播放地址（带短缓存）。
 *
 * 注意空字符串也是失败：joox 就是这个形态（`{"url":"","br":-1}`），
 * 不判空的话会拿到一个空 src，前端静默播不出声音，很难排查。
 */
export async function getPlayUrl(apiId: string): Promise<ApiResult<string>> {
  const cached = playUrlCache.get(apiId)
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.url }
  }

  const result = await callApi({ types: "url", id: apiId, br: "320" })
  if (!result.ok) return result

  const payload = result.data as { url?: unknown }
  const url = typeof payload?.url === "string" ? payload.url : ""
  if (url.length === 0) {
    return { ok: false, error: "这首歌暂时拿不到播放地址" }
  }

  // 简单的容量控制：超上限就丢掉最早插入的一条
  if (playUrlCache.size >= PLAY_URL_CACHE_MAX) {
    const oldest = playUrlCache.keys().next().value
    if (oldest !== undefined) playUrlCache.delete(oldest)
  }
  playUrlCache.set(apiId, { url, expiresAt: Date.now() + PLAY_URL_TTL_MS })

  return { ok: true, data: url }
}

/** 取封面地址。只在绑定时调用一次，结果入库 */
export async function getCoverUrl(picId: string): Promise<ApiResult<string>> {
  const result = await callApi({ types: "pic", id: picId, size: "300" })
  if (!result.ok) return result

  const payload = result.data as { url?: unknown }
  const url = typeof payload?.url === "string" ? payload.url : ""
  if (url.length === 0) return { ok: false, error: "拿不到封面" }

  return { ok: true, data: url }
}

/** 取歌词（LRC 原文）。只在绑定时调用一次，结果入库 */
export async function getLyric(lyricId: string): Promise<ApiResult<string>> {
  const result = await callApi({ types: "lyric", id: lyricId })
  if (!result.ok) return result

  const payload = result.data as { lyric?: unknown }
  const lyric = typeof payload?.lyric === "string" ? payload.lyric : ""
  if (lyric.trim().length === 0) return { ok: false, error: "这首歌没有歌词" }

  return { ok: true, data: lyric }
}
