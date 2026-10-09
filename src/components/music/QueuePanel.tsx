"use client"

import { ChevronDown, ListMusic, Pause, Play } from "lucide-react"
import { usePlayer } from "./player-context"

/**
 * 向上弹出的播放列表（从 PlayerBar 拆出来的新组件）。
 *
 * 与歌词抽屉是**互斥**的：两个都从底部弹出、占的位置几乎一样，
 * 同时开着会叠在一起。所以由播放条统一管「当前弹的是哪个」。
 *
 * 列表里点某一首用 `playSong` 而不是 `play` —— 只换当前曲、不重建队列，
 * 否则点一首就把整个播放顺序换掉了。
 */
export default function QueuePanel({
  open,
  onClose,
  /** 面板底部要抬高多少，避免与歌词抽屉重叠 */
  offsetClass,
}: {
  open: boolean
  onClose: () => void
  offsetClass: string
}) {
  const { queue, current, playing, playSong, toggle } = usePlayer()

  if (!open) return null

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 px-3 md:px-6 ${offsetClass}`}>
      <div className="mx-auto max-w-3xl rounded-t-2xl border border-b-0 border-gray-200 bg-white/95 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <span className="text-xs text-gray-400">
            播放列表 · 共 {queue.length} 首
            {queue.length === 0 && "（先从卡片墙点一首歌）"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="收起播放列表"
          >
            <ChevronDown size={16} />
          </button>
        </div>

        <ul className="max-h-56 overflow-y-auto py-1">
          {queue.map((song, index) => {
            const isCurrent = current?.id === song.id
            return (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => (isCurrent ? toggle() : playSong(song))}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                    isCurrent ? "bg-gray-50" : "hover:bg-gray-50"
                  }`}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-gray-300">
                    {index + 1}
                  </span>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isCurrent && playing ? (
                      <Pause size={12} className="text-gray-900" />
                    ) : (
                      <Play
                        size={12}
                        className={isCurrent ? "text-gray-900" : "text-gray-300"}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        isCurrent ? "font-medium text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {song.title}
                    </span>
                    <span className="block truncate text-xs text-gray-400">{song.artist}</span>
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 text-[10px] text-gray-400">正在播放</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {queue.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
            <ListMusic size={16} />
            还没有播放列表
          </p>
        )}
      </div>
    </div>
  )
}
