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

/**
 * 播放地址的缓存时长。签名 URL 有有效期，所以只短缓存。
 *
 * 取 5 分钟而不是更长：签名地址的有效期约 1 小时（URL 里带时间戳），
 * 但「拿到就一定能播」这件事没有保证，短缓存能让换绑 / 服务端轮换签名后
 * 更快自愈。播放器那边还有「失败即绕过缓存重取一次」的兜底，见 getPlayUrl。
 */
const PLAY_URL_TTL_MS = 5 * 60 * 1000
/** 缓存条目上限，避免长时间运行后无限增长 */
const PLAY_URL_CACHE_MAX = 500

/**
 * 失败原因的分类码。
 *
 * 为什么要有它：播放器需要**按原因分流**——
 * 「这首歌没版权」应当立刻跳到下一首，而「配额用完了」应当退避重试，
 * 两者的处理完全相反。若前端只能拿到中文文案，就只能靠匹配字符串来判断，
 * 那样文案一改、分流就静默失效（本项目已经吃过「同一套规则被抄成多份」的亏）。
 *
 * 分开两个维度，因为前端的处理方式不同：
 *   - `permanent`：重试没有意义，直接换歌
 *   - `transient`：等一下可能就好，值得退避重试
 */
export type MusicErrorCode =
  /** 歌没绑定 API，或库里没这首歌 —— 永久 */
  | "not_playable"
  /** 第三方返回空地址（实测 kuwo / joox 就是这形态）—— 永久，该音源没有 */
  | "url_unavailable"
  /** 自设配额（45 次 / 5 分钟）用完了 —— 暂时，等窗口滚动即可恢复 */
  | "quota_exhausted"
  /** 第三方 503 / 超时 / 网络不通 —— 暂时 */
  | "upstream_error"
  /** 本机按 IP 限流（60 次 / 分钟）—— 暂时 */
  | "rate_limited"
  /** 参数不合法 —— 永久（代码问题，不是环境问题） */
  | "bad_request"
  /** 没登录 */
  | "unauthorized"

/** 每个码的归类。播放器据此决定「重试还是换歌」 */
export const MUSIC_ERROR_KIND: Record<MusicErrorCode, "permanent" | "transient"> = {
  not_playable: "permanent",
  url_unavailable: "permanent",
  quota_exhausted: "transient",
  upstream_error: "transient",
  rate_limited: "transient",
  bad_request: "permanent",
  unauthorized: "permanent",
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      /**
       * 分类码。**可选**：`code` 是后加的，且后台那些调用点只关心文案
       * （绑定/匹配流程不需要按原因分流），所以不强制每个失败都带上，
       * 免得为了补齐它去改一堆与本次优化无关的地方。
       */
      code?: MusicErrorCode
    }

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

/** 两次调用之间的最小间隔。实测连续快速搜索会拿到 503，加个间隔既是礼貌也更稳 */
const CALL_GAP_MS = 400
let lastCallAt = 0

/** 统一的请求封装：带超时、统一错误文案，绝不把底层异常抛给调用方 */
async function callApi(params: Record<string, string>): Promise<ApiResult<unknown>> {
  const now = Date.now()
  pruneRecentCalls(now)
  if (recentCalls.length >= RATE_BUDGET) {
    return {
      ok: false,
      error: "音乐接口的调用配额快用完了，请过几分钟再试",
      // 自己的配额闸门：这是**暂时**的，等 5 分钟窗口滚动就恢复
      code: "quota_exhausted",
    }
  }

  const gap = now - lastCallAt
  if (gap < CALL_GAP_MS) {
    await new Promise((resolve) => setTimeout(resolve, CALL_GAP_MS - gap))
  }
  lastCallAt = Date.now()
  recentCalls.push(lastCallAt)

  const query = new URLSearchParams({ ...params, source: params.source ?? MUSIC_SOURCE })
  const url = `${API_BASE}?${query.toString()}`

  // 503 是实测遇到过的瞬时错误，重试一次；其余情况不重试，免得白白消耗配额
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        // 这个接口不稳定，不能让 Next 把失败结果也缓存住
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "application/json" },
      })

      if (res.status === 503 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        continue
      }
      if (!res.ok) {
        // 4xx/5xx 都归到上游异常：对我们来说都是「第三方现在给不了」
        return { ok: false, error: `音乐接口返回 ${res.status}`, code: "upstream_error" }
      }
      return { ok: true, data: await res.json() }
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? "音乐接口响应超时"
          : "音乐接口暂时无法访问"
      if (attempt === 0 && reason.includes("超时")) {
        continue
      }
      return { ok: false, error: reason, code: "upstream_error" }
    }
  }

  return { ok: false, error: "音乐接口暂时不可用", code: "upstream_error" }
}

/**
 * 搜索歌曲。只用于后台（搜索添加与单首绑定），前台刻意不开放搜索。
 *
 * `artist` 可选：带上它就把关键词拼成「歌名 歌手」。
 * 实测（docs/music-plan.md 有记录）这个写法让歌名精确相同的候选更多、
 * 原版更靠前：「起风了 冯沁苑」拿到 9 条同名候选，只搜歌名只有 5 条。
 */
export async function searchSongs(
  keyword: string,
  artist?: string
): Promise<ApiResult<ApiSong[]>> {
  const name = artist?.trim() ? `${keyword} ${artist.trim()}` : keyword
  const result = await callApi({ types: "search", name })
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
 *
 * `force` 用于播放器「播到一半地址失效」的场景：跳过缓存重新取一次，
 * 否则会拿到那条已经坏掉的缓存地址，重试变成原地打转。
 */
export async function getPlayUrl(
  apiId: string,
  options: { force?: boolean } = {}
): Promise<ApiResult<string>> {
  const cached = playUrlCache.get(apiId)
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.url }
  }

  const result = await callApi({ types: "url", id: apiId, br: "320" })
  if (!result.ok) return result

  const payload = result.data as { url?: unknown }
  const url = typeof payload?.url === "string" ? payload.url : ""
  if (url.length === 0) {
    /*
     * 空地址 = 这个音源没有这首歌。
     * 归为**永久**失败（前端立刻换歌），因为重试同一个音源不会变出地址来。
     * 实测 kuwo 与 joox 就是这形态（`{"url":"","br":-1}`），
     * 而项目只认 netease 一个音源（见 docs/music-plan.md 的实测结论）。
     */
    return { ok: false, error: "这首歌暂时拿不到播放地址", code: "url_unavailable" }
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
