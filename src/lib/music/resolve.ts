import { recordFailure, recordSuccess } from "./health"
import { BUDGETS, PLAY_ORDER, PROVIDERS } from "./registry"
import { probeAudio } from "./probe"
import type { ApiResult, MusicErrorCode, ProviderId, ResolvableSongLike } from "./types"
import type { PlayCandidate } from "./types"

/**
 * 播放地址解析（**服务端专用**）。
 *
 * 流程：按 `PLAY_ORDER` 决定问哪些接口 → 拿候选 → **逐个探活** → 命中即用并短缓存。
 *
 * 两个关键设计（都是被线上教出来的）：
 *  1. 「这个源没有这首歌」（永久）与「这个源现在坏了」（暂时）必须分开：
 *     否则上游一次限流就会把能播的歌永久判死，播放器直接跳过。
 *  2. 成功缓存 5 分钟（vkey 会失效，不能久存）；暂时失败只缓存 30 秒，
 *     既不会连续撞坏源，又能很快恢复。
 */

export interface ResolvedPlayUrl {
  url: string
  provider: ProviderId
  quality: string
}

const RESOLVE_TTL_MS = 5 * 60 * 1000
const FAILURE_TTL_MS = 30 * 1000
const CACHE_MAX = 800

/**
 * 测试用：MUSIC_DISABLED_PROVIDERS=gd 可强制跳过某个源，验证回退是否生效。
 * 每次调用时才读环境变量 —— 以前在模块加载时读，导致测试里注入的变量不生效。
 */
function isDisabled(providerId: string): boolean {
  const raw = process.env.MUSIC_DISABLED_PROVIDERS ?? ""
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .includes(providerId)
}

const debugEnabled = process.env.MUSIC_DEBUG === "1"
const dbg = (...args: unknown[]) => {
  if (debugEnabled) console.info("[music]", ...args)
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

/** 清掉某首歌的缓存（测试/排障用） */
export function invalidateResolved(songId: number) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${songId}:`)) cache.delete(key)
  }
}

export async function resolvePlayUrl(
  song: ResolvableSongLike,
  options: { force?: boolean } = {}
): Promise<ApiResult<ResolvedPlayUrl>> {
  const cacheKey = `${song.id}:${song.apiId}:${song.source ?? "netease"}`
  if (!options.force) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) return hit.result
  }

  const source = song.source === "tencent" ? "tencent" : "netease"
  const order = PLAY_ORDER[source]

  let anyErrored = false
  let probedAny = false

  for (const providerId of order) {
    if (isDisabled(providerId)) continue
    const provider = PROVIDERS[providerId]
    if (!provider.playUrls) continue

    // 自限流：预算用完就跳过这个源，而不是硬撞上游
    const attemptStarted = Date.now()
    const budgetOk = await BUDGETS[providerId].take()
    if (!budgetOk) {
      dbg("budget exhausted", providerId)
      recordFailure(providerId, "自限流：窗口配额已用完")
      anyErrored = true
      continue
    }

    let candidates: PlayCandidate[] = []
    try {
      // 每次调用都重新读环境变量：测试要能注入 MUSIC_DISABLED_PROVIDERS
      const result = await provider.playUrls({
        apiId: song.apiId,
        title: song.title,
        artist: song.artist,
      })
      candidates = result.candidates
      if (result.errored) {
        recordFailure(providerId, "接口返回异常（限流或上游故障）")
        anyErrored = true
      }
    } catch (error) {
      const reason = (error as Error).message.slice(0, 60)
      dbg("provider threw", providerId, reason)
      recordFailure(providerId, reason)
      anyErrored = true
      continue
    }

    for (const candidate of candidates) {
      probedAny = true
      const playable = await probeAudio(candidate.url)
      dbg("probe", providerId, candidate.quality, playable)
      if (!playable) continue

      recordSuccess(providerId, Date.now() - attemptStarted)
      const ok: ApiResult<ResolvedPlayUrl> = {
        ok: true,
        data: { url: candidate.url, provider: providerId, quality: candidate.quality },
      }
      cacheSet(cacheKey, ok)
      return ok
    }
  }

  /*
   * 区分两种失败：
   *  - 有源坏过 或 候选都探不通 → upstream_error（暂时，值得退避重试）
   *  - 所有源都正常回答"没有"   → url_unavailable（永久，播放器直接跳过）
   */
  const failed: ApiResult<ResolvedPlayUrl> = {
    ok: false,
    error: probedAny ? "这首歌当前所有音源都拿不到可播放的地址" : "这首歌暂时拿不到播放地址",
    code: (anyErrored || probedAny ? "upstream_error" : "url_unavailable") as MusicErrorCode,
  }
  cacheSet(cacheKey, failed)
  return failed
}
