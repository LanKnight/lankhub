"use client"

import { Check, Loader2, Search, TriangleAlert, X } from "lucide-react"

import type { Proposal } from "./song-types"

/**
 * 批量自动匹配的进度条与结果确认面板（从 SongManager 里拆出来的）。
 *
 * 这里只负责"展示 + 把人点的那一下转发出去"：挑选版本、跳过单条、标记无原版、
 * 确认写入。真正的写库在父组件的 handleConfirmAll / handleMarkNoMatch 里。
 */
export default function MatchPanel({
  matching,
  matchDone,
  matchTotal,
  results,
  picked,
  binding,
  pickableCount,
  noMatchCount,
  onPick,
  onManualSearch,
  onRemove,
  onClose,
  onMarkNoMatch,
  onConfirmAll,
}: {
  matching: boolean
  matchDone: number
  matchTotal: number
  results: Proposal[] | null
  picked: Record<number, string>
  binding: boolean
  pickableCount: number
  noMatchCount: number
  onPick: (songId: number, apiId: string) => void
  onManualSearch: (songId: number) => void
  onRemove: (songId: number) => void
  onClose: () => void
  onMarkNoMatch: () => void
  onConfirmAll: () => void
}) {
  return (
    <>
      {/* 批量匹配的进度 */}
      {matching && (
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-sm text-gray-600">
            正在搜索原版… {matchDone} / {matchTotal}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${matchTotal ? (matchDone / matchTotal) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            每首要花 1 次第三方搜索，接口限流 60 次 / 5 分钟，请稍等
          </p>
        </div>
      )}

      {/* 批量匹配结果：逐条让人确认，确认前不写库 */}
      {results && results.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
            <span className="text-sm font-semibold text-gray-800">自动匹配结果</span>
            <span className="text-xs text-gray-400">
              共 {results.length} 条 · 找到原版{" "}
              {results.filter((p) => p.confidence === "high").length} 条 ·
              需要人工判断 {results.filter((p) => p.confidence !== "high").length} 条
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto p-1.5 text-gray-400 transition-colors hover:text-gray-900"
              aria-label="关闭结果面板"
            >
              <X size={15} />
            </button>
          </div>

          <ul className="divide-y divide-gray-100">
            {results.map((p) => {
              const manualId = picked[p.songId]
              const selected =
                p.candidates.find((c) => c.apiId === manualId) ??
                (p.confidence === "high" ? p.matched : null)
              const willSkip = !selected

              return (
                <li key={p.songId} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 左边：我记的歌 */}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-900">{p.title}</p>
                      <p className="truncate text-xs text-gray-400">{p.artist}</p>
                    </div>

                    <span className="shrink-0 text-gray-300">→</span>

                    {/* 中间：选中的版本 */}
                    {selected ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-gray-900">
                            {selected.title}
                            {selected.album && (
                              <span className="text-gray-400">（{selected.album}）</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-gray-500">{selected.artist}</p>
                        </div>
                        {p.confidence === "high" && !manualId && (
                          <span className="shrink-0 rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                            歌名歌手都对得上
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm text-amber-600">
                          <TriangleAlert size={14} className="shrink-0" />
                          {p.error
                            ? `搜索失败：${p.error}`
                            : p.titleMatches.length > 0
                              ? "只有翻唱，源站没有原版"
                              : "没找到这首歌"}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {p.titleMatches.length > 0
                            ? `歌名相同的 ${p.titleMatches.length} 条歌手都对不上，多半是翻唱`
                            : "建议补一个外链，前台会显示「去别处听」"}
                        </p>
                      </div>
                    )}

                    {/* 右边：操作 */}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {p.candidates.length > 0 && (
                        <select
                          value={manualId ?? ""}
                          onChange={(e) => onPick(p.songId, e.target.value)}
                          className="max-w-[13rem] rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-accent"
                          aria-label={`为「${p.title}」换一个版本`}
                        >
                          <option value="">换一个…</option>
                          {p.candidates.map((c) => (
                            <option key={c.apiId} value={c.apiId}>
                              {c.title} — {c.artist}
                              {c.album ? `（${c.album}）` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => onManualSearch(p.songId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
                      >
                        <Search size={12} />
                        手动搜
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(p.songId)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-900"
                        aria-label="先跳过这条"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {willSkip && p.titleMatches.length > 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      歌名相同的候选歌手全对不上，多半是翻唱；要点下面的
                      「标记无原版」才会记下来，不会动它现在的外链
                    </p>
                  )}
                  {willSkip && p.titleMatches.length === 0 && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      连歌名都没搜到，可能歌名里带了括号或源站没收录。
                      这里不会把它标成无原版，方便你以后再搜
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
            <span className="text-xs text-gray-500">
              将写入 {pickableCount} 首
              {noMatchCount > 0 && (
                <span className="text-gray-400"> · 另有 {noMatchCount} 首只有翻唱</span>
              )}
            </span>

            {/*
              刻意不把「只有翻唱」自动带进写入：标记是可逆性差的操作
              （标了以后自动匹配就不再搜它），得由人点一下才算数
            */}
            {noMatchCount > 0 && (
              <button
                type="button"
                onClick={onMarkNoMatch}
                disabled={binding}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
              >
                <TriangleAlert size={13} />
                标记无原版
              </button>
            )}

            <button
              type="button"
              onClick={onConfirmAll}
              disabled={binding || pickableCount === 0}
              className={`${
                noMatchCount > 0 ? "" : "ml-auto "
              }inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50`}
            >
              {binding ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              确认并写入 {pickableCount} 首
            </button>
          </div>
        </div>
      )}
    </>
  )
}
