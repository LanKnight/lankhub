import { searchSongs } from "@/lib/music-api"
import { searchQqSongs } from "@/lib/music-qq"

import { BUDGETS, PROVIDERS } from "./registry"
import type { ProviderId } from "./types"

/**
 * 源健康计数（进程内，重启清零）。
 *
 * 为什么需要它：Tang 挂掉那次，我事后是"从服务器 curl 一下"才确认的 ——
 * 站点本身没有任何地方能看出"是哪个源在失败、失败多久了"。
 * 后台要看的就是这个：每个源最近成功/失败、错误原因、预算余量。
 *
 * 只放内存不落库：这些是"当下状态"，重启后重新采样即可，落库反而要处理过期。
 */

export interface ProviderHealth {
  /** 解析成功次数 */
  success: number
  /** 解析失败次数（含超时、限流、探活失败） */
  failure: number
  /** 最近一次失败原因（截断到 80 字） */
  lastError: string | null
  lastErrorAt: number | null
  lastSuccessAt: number | null
  /** 最近一次成功调用的耗时 */
  lastLatencyMs: number | null
}

const state: Record<ProviderId, ProviderHealth> = {
  gd: { success: 0, failure: 0, lastError: null, lastErrorAt: null, lastSuccessAt: null, lastLatencyMs: null },
  tang: { success: 0, failure: 0, lastError: null, lastErrorAt: null, lastSuccessAt: null, lastLatencyMs: null },
  meting: { success: 0, failure: 0, lastError: null, lastErrorAt: null, lastSuccessAt: null, lastLatencyMs: null },
}

export function recordSuccess(provider: ProviderId, latencyMs: number) {
  const item = state[provider]
  item.success += 1
  item.lastSuccessAt = Date.now()
  item.lastLatencyMs = latencyMs
}

export function recordFailure(provider: ProviderId, reason: string) {
  const item = state[provider]
  item.failure += 1
  item.lastError = reason.slice(0, 80)
  item.lastErrorAt = Date.now()
}

/** 当前快照（给后台面板用） */
export function healthSnapshot() {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
    const provider = PROVIDERS[id]
    return {
      id,
      label: provider.label,
      capabilities: provider.capabilities,
      mediaHosts: provider.mediaHosts,
      budget: { ...BUDGETS[id].snapshot(), config: provider.budget },
      health: { ...state[id] },
    }
  })
}

/**
 * 一键探活：真的发一个最小请求，确认这个源现在能不能用。
 * 会占用该源的预算（本来就该占，避免探活把配额打光）。
 */
export async function probeProvider(id: ProviderId): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const started = Date.now()
  const allowed = await BUDGETS[id].take()
  if (!allowed) {
    return { ok: false, detail: "自限流：该源当前窗口配额已用完，稍后再试", latencyMs: 0 }
  }

  try {
    if (id === "gd") {
      const result = await searchSongs("晴天")
      const latencyMs = Date.now() - started
      if (!result.ok) return { ok: false, detail: result.error, latencyMs }
      return { ok: true, detail: `搜索正常，返回 ${result.data.length} 条`, latencyMs }
    }

    if (id === "tang") {
      const result = await searchQqSongs("晴天", "周杰伦")
      const latencyMs = Date.now() - started
      if (!result.ok) return { ok: false, detail: result.error, latencyMs }
      return { ok: true, detail: `搜索正常，返回 ${result.data.length} 条`, latencyMs }
    }

    // meting：直接取一小段音频流
    const res = await fetch("https://api.injahow.cn/meting/?type=url&id=186016", {
      headers: { Range: "bytes=0-2047", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    await res.arrayBuffer()
    const latencyMs = Date.now() - started
    const ok = res.status === 200 || res.status === 206
    return { ok, detail: ok ? "音频流正常" : `HTTP ${res.status}`, latencyMs }
  } catch (error) {
    return { ok: false, detail: (error as Error).message.slice(0, 60), latencyMs: Date.now() - started }
  }
}
