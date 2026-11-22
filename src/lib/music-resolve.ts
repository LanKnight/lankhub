import { getGdPlayUrl, type ApiResult, type MusicErrorCode } from "./music-api"
import { getQqPlayUrls, searchQqSongs } from "./music-qq"

/**
 * 播放地址解析（**服务端专用**）。
 *
 * 为什么要多源：单一第三方接口不稳定 —— 实测 GD 同一批 12 次请求里 4 次返回
 * HTML 错误页（不是 JSON），而它又承担着全部网易云歌曲。一旦它抖动，整个站点
 * 就没歌可听。
 *
 * 所以这里按顺序试多个来源，并且**每个候选地址都真的探一下能不能取到音频**，
 * 而不是拿到 JSON 就当成功。
 *
 * 一个关键区分：**「这个源说它没有这首歌」和「这个源现在坏了」完全不同**。
 * 前者是永久失败（播放器该跳过），后者是暂时失败（该退避重试）。
 * 早期版本把两者混在一起，结果 Tang 偶发限流一次，歌就被永久判死 —— 这里分开记。
 *
 * 音质：站长要求"直接选最高"。所以 GD 先要 999（24bit，常回 948），
 * 拿不到再降 740 / 320；QQ 先要 SQ（1647kbps FLAC），再 PQ，最后 m4a。
 */

export type ProviderName = "gd" | "meting" | "qq"

/** 解析成功时带上来源，方便排查"这首歌到底谁在服务" */
export interface ResolvedPlayUrl {
  url: string
  provider: ProviderName
  /** 实际拿到的音质描述 */
  quality: string
}

interface Candidate {
  url: string
  quality: string
}

/** `errored` 表示"这个源自己出问题了"，与"它正常回答但没有这首歌"区分开 */
interface ProviderResult {
  candidates: Candidate[]
  errored: boolean
}

const TIMEOUT_MS = 8000
const PROBE_TIMEOUT_MS = 6000
/** 成功结果缓存 5 分钟：vkey 会失效，不能久存 */
const RESOLVE_TTL_MS = 5 * 60 * 1000
/** 暂时性失败只缓存 30 秒，避免整站连续撞同一个坏源，又能很快重试 */
const FAILURE_TTL_MS = 30 * 1000
const CACHE_MAX = 800

/** 测试用：MUSIC_DISABLED_PROVIDERS=gd 可强制跳过某个源，验证回退是否生效 */
const disabled = new Set(
  (process.env.MUSIC_DISABLED_PROVIDERS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
)

const debugEnabled = process.env.MUSIC_DEBUG === "1"
function dbg(...args: unknown[]) {
  if (debugEnabled) console.info("[music-resolve]", ...args)
}

interface CacheEntry {
  result: ApiResult<ResolvedPlayUrl>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheSet(key: string, result: ApiResult<ResolvedPlayUrl>) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, {
    result,
    expiresAt: Date.now() + (result.ok ? RESOLVE_TTL_MS : FAILURE_TTL_MS),
  })
}

/* ------------------------- 自限流（GD / Meting） ------------------------- */

interface Budget {
  calls: number[]
  limit: number
  windowMs: number
  gapMs: number
  lastAt: number
}

const budgets: Record<"gd" | "meting", Budget> = {
  // GD 自己的配额在 music-api.ts 里还有一道（45 次 / 5 分钟）
  gd: { calls: [], limit: 60, windowMs: 5 * 60 * 1000, gapMs: 0, lastAt: 0 },
  meting: { calls: [], limit: 60, windowMs: 5 * 60 * 1000, gapMs: 400, lastAt: 0 },
}

async function takeBudget(provider: "gd" | "meting"): Promise<boolean> {
  const budget = budgets[provider]
  const now = Date.now()
  while (budget.calls.length > 0 && now - budget.calls[0] > budget.windowMs) budget.calls.shift()
  if (budget.calls.length >= budget.limit) return false

  const gap = now - budget.lastAt
  if (budget.gapMs > 0 && gap < budget.gapMs) {
    await new Promise((resolve) => setTimeout(resolve, budget.gapMs - gap))
  }
  budget.lastAt = Date.now()
  budget.calls.push(budget.lastAt)
  return true
}

/* ------------------------- 候选地址验证 ------------------------- */

/**
 * 真的取一小段音频，确认这个地址现在就能播。
 *
 * 只看 HTTP 200 不够：QQ 的 vkey 过期后会返回 403 但响应头仍是 audio/mp4。
 * 所以要求 200/206 + content-type 是 audio/*（有的 CDN 不给 content-type，
 * 那就只看状态码）。
 */
async function probeAudio(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-2047", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    })
    if (res.status !== 200 && res.status !== 206) {
      dbg("probe fail status", res.status, url.slice(0, 60))
      return false
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase()
    if (type && !type.startsWith("audio/") && !type.includes("octet-stream")) {
      dbg("probe fail type", type, url.slice(0, 60))
      return false
    }
    await res.arrayBuffer()
    return true
  } catch (error) {
    dbg("probe error", (error as Error).message.slice(0, 60))
    return false
  }
}

/* ------------------------- 各源候选 ------------------------- */

/** GD（网易云）：从最高音质开始要，拿不到就降 */
async function candidatesFromGd(apiId: string): Promise<ProviderResult> {
  const candidates: Candidate[] = []
  let errored = false
  for (const br of ["999", "740", "320"]) {
    if (!(await takeBudget("gd"))) {
      errored = true
      break
    }
    const result = await getGdPlayUrl(apiId, br)
    if (result.ok && result.data) {
      candidates.push({ url: result.data, quality: `gd-${br}` })
      break
    }
    if (!result.ok && result.code === "url_unavailable") continue // 这个音质没有，降档再试
    errored = true
    break
  }
  dbg("gd", candidates.length ? candidates[0].quality : "none", errored ? "errored" : "")
  return { candidates, errored }
}

/**
 * Meting 公共实例（同一个网易云 id 的另一条线路）。
 *
 * 注意：这个实例的 `type=url` **直接返回音频流**（开头就是 ID3），不是 JSON。
 * 所以它本身就是可播地址 —— 直接当候选交给 probeAudio 验证即可，
 * 不需要解析响应体（早期版本按 JSON 解析，永远失败，等于这个源从未生效）。
 */
async function candidatesFromMeting(apiId: string): Promise<ProviderResult> {
  if (!(await takeBudget("meting"))) return { candidates: [], errored: true }
  const url = `https://api.injahow.cn/meting/?type=url&id=${encodeURIComponent(apiId)}`
  dbg("meting candidate", url)
  return { candidates: [{ url, quality: "meting-default" }], errored: false }
}

/** QQ 音乐：按「歌名 + 歌手」搜到 song_mid，再取 SQ → PQ → m4a */
async function candidatesFromQq(title: string, artist: string): Promise<ProviderResult> {
  const found = await searchQqSongs(title, artist)
  if (!found.ok) {
    dbg("qq search failed", found.error)
    return { candidates: [], errored: found.errorKind === "upstream" }
  }

  // 双匹配：歌名完全相同、歌手对得上（避免落到 Live / 翻唱）
  const artistKey = artist.toLowerCase().replace(/\s+/g, "")
  const exact = found.data.find((item) => {
    const singer = item.artist.toLowerCase().replace(/\s+/g, "")
    return item.title === title.trim() && singer.includes(artistKey)
  })
  if (!exact) {
    dbg("qq 没有同名同歌手的版本")
    return { candidates: [], errored: false }
  }

  const urls = await getQqPlayUrls(exact.apiId, exact.title)
  if (!urls.ok) {
    dbg("qq detail failed", urls.error)
    return { candidates: [], errored: urls.errorKind === "upstream" }
  }

  const candidates: Candidate[] = []
  if (urls.data.sq) candidates.push({ url: urls.data.sq, quality: "qq-sq" })
  if (urls.data.pq) candidates.push({ url: urls.data.pq, quality: "qq-pq" })
  if (urls.data.m4a) candidates.push({ url: urls.data.m4a, quality: "qq-m4a" })
  dbg("qq candidates", candidates.map((c) => c.quality).join(","))
  return { candidates, errored: false }
}

/* ------------------------- 对外入口 ------------------------- */

export interface ResolvableSong {
  id: number
  title: string
  artist: string
  apiId: string
  source: string | null
}

/**
 * 解析一首歌的播放地址：按 源顺序 → 逐个候选 → 探活 → 命中即返回。
 *
 * `force` 用于播放器"播到一半地址失效"：跳过缓存重来一次。
 */
export async function resolvePlayUrl(
  song: ResolvableSong,
  options: { force?: boolean } = {}
): Promise<ApiResult<ResolvedPlayUrl>> {
  const cacheKey = `${song.id}:${song.apiId}:${song.source ?? "netease"}`
  if (!options.force) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) return hit.result
  }

  const isTencent = (song.source ?? "netease") === "tencent"
  // QQ 源的歌先走 QQ；网易云源的歌先走 GD，再退到 Meting，最后按歌名去 QQ 找
  const order: ProviderName[] = isTencent ? ["qq", "meting"] : ["gd", "meting", "qq"]

  let anyErrored = false
  let probedAny = false

  for (const provider of order) {
    if (disabled.has(provider)) continue
    // 网易云 id 在 GD 上才有意义，QQ 源的歌不去问 GD
    if (provider === "gd" && isTencent) continue

    let result: ProviderResult
    if (provider === "gd") result = await candidatesFromGd(song.apiId)
    else if (provider === "meting") result = await candidatesFromMeting(song.apiId)
    else result = await candidatesFromQq(song.title, song.artist)

    if (result.errored) anyErrored = true

    for (const candidate of result.candidates) {
      probedAny = true
      const playable = await probeAudio(candidate.url)
      dbg("probe", provider, candidate.quality, playable)
      if (!playable) continue

      const ok: ApiResult<ResolvedPlayUrl> = {
        ok: true,
        data: { url: candidate.url, provider, quality: candidate.quality },
      }
      cacheSet(cacheKey, ok)
      return ok
    }
  }

  /*
   * 区分两种失败：
   *  - 有源坏过 或 候选地址都探不通 → upstream_error（暂时，值得退避重试）
   *  - 所有源都正常回答"没有"     → url_unavailable（永久，播放器直接跳过）
   */
  const failed: ApiResult<ResolvedPlayUrl> = {
    ok: false,
    error: probedAny ? "这首歌当前所有音源都拿不到可播放的地址" : "这首歌暂时拿不到播放地址",
    code: (anyErrored || probedAny ? "upstream_error" : "url_unavailable") as MusicErrorCode,
  }
  cacheSet(cacheKey, failed)
  return failed
}

/** 测试/排障用：清掉某首歌的缓存 */
export function invalidateResolved(songId: number) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${songId}:`)) cache.delete(key)
  }
}
