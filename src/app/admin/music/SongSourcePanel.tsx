"use client"

import { useCallback, useEffect, useState } from "react"

import { useToast } from "@/components/ui/Toast"

interface SourceRow {
  id: string
  label: string
  capabilities: string[]
  mediaHosts: string[]
  budget: { used: number; limit: number; remaining: number; windowRemainingMs: number }
  health: {
    success: number
    failure: number
    lastError: string | null
    lastErrorAt: number | null
    lastSuccessAt: number | null
    lastLatencyMs: number | null
  }
}

const CAPABILITY_LABEL: Record<string, string> = {
  search: "搜索",
  playUrl: "播放",
  cover: "封面",
  lyric: "歌词",
}

function ago(ts: number | null): string {
  if (!ts) return "从未"
  const diff = Date.now() - ts
  if (diff < 60_000) return "刚刚"
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

/**
 * 音乐源状态面板。
 *
 * 存在的意义：源挂掉时，站长应该在这里一眼看到「哪个源、失败多久了、什么原因」，
 * 而不是像上次那样靠我 SSH 上去 curl。
 */
export default function SourcePanel() {
  const { toast } = useToast()
  const [sources, setSources] = useState<SourceRow[] | null>(null)
  const [probing, setProbing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/music/sources", { cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "读取失败")
        return
      }
      setError(null)
      setSources(data.sources ?? [])
    } catch {
      setError("网络错误")
    }
  }, [])

  useEffect(() => {
    void load()
    // 30 秒刷新一次：失败计数是滚动累加的，不刷新看不出"现在还在挂"
    const timer = setInterval(() => void load(), 30_000)
    return () => clearInterval(timer)
  }, [load])

  async function probe(id: string) {
    setProbing(id)
    try {
      const res = await fetch("/api/admin/music/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast(data?.error || "探活失败", "error")
        return
      }
      toast(
        `${id}：${data.ok ? "可用" : "不可用"} · ${data.detail}（${data.latencyMs}ms）`,
        data.ok ? "success" : "error"
      )
      await load()
    } finally {
      setProbing(null)
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">读取音源状态失败：{error}</p>
  }
  if (!sources) {
    return <p className="text-sm text-gray-400">读取中…</p>
  }

  return (
    <div className="space-y-3">
      {sources.map((item) => {
        const ok = item.health.lastSuccessAt && (!item.health.lastErrorAt || item.health.lastSuccessAt > item.health.lastErrorAt)
        return (
          <div key={item.id} className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm font-medium text-gray-900">{item.label}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{item.id}</span>
              {item.capabilities.map((cap) => (
                <span key={cap} className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-gray-200">
                  {CAPABILITY_LABEL[cap] ?? cap}
                </span>
              ))}
              <button
                type="button"
                onClick={() => void probe(item.id)}
                disabled={probing === item.id}
                className="ml-auto rounded-lg px-2 py-1 text-xs text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
              >
                {probing === item.id ? "探活中…" : "探活"}
              </button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500 sm:grid-cols-4">
              <div>
                <dt className="text-gray-400">成功 / 失败</dt>
                <dd className="text-gray-700">
                  {item.health.success} / {item.health.failure}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">预算余量</dt>
                <dd className="text-gray-700">
                  {item.budget.remaining} / {item.budget.limit}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">最近成功</dt>
                <dd className="text-gray-700">{ago(item.health.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">最近失败</dt>
                <dd className="text-gray-700">{ago(item.health.lastErrorAt)}</dd>
              </div>
            </dl>

            {item.health.lastError && (
              <p className="mt-2 text-xs text-red-600">最近错误：{item.health.lastError}</p>
            )}
          </div>
        )
      })}
      <p className="text-xs text-gray-400">
        计数从最近一次服务重启开始，重启清零；「探活」会真实请求该源，占用它的配额。
      </p>
    </div>
  )
}
