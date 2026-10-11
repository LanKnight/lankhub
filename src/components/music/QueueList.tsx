"use client"

import { ListMusic, Pause, Play } from "lucide-react"
import { usePlayer } from "./player-context"

/**
 * 播放列表的**列表本体** —— 底部抽屉与沉浸层的右侧抽屉共用这一份。
 *
 * 为什么不各写一份：行的渲染、当前曲高亮、点歌切换这几件事一旦有两份实现，
 * 迟早会漂移（一处改了另一处忘改，静默不一致）。
 * 外壳（从底部弹 / 从右侧滑）由调用方决定，这份只管列表。
 *
 * ⚠️ `compact` 是给右侧抽屉用的：抽屉里一行要显示 **歌名 + 歌手 + 专辑** 三行，
 * 用底部抽屉那种宽松行高会把可视条数压到个位数，翻列表很难受。
 */
export default function QueueList({
  onPick,
  compact = false,
}: {
  /** 用户点了某一首（当前曲则视为播放/暂停切换）。抽屉可据此自行收起 */
  onPick?: () => void
  /** 右侧抽屉用紧凑行高：一行里要塞下歌名 + 歌手 + 专辑 */
  compact?: boolean
}) {
  const { queue, current, playing, playSong, toggle } = usePlayer()

  if (queue.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
        <ListMusic size={16} />
        还没有播放列表
      </p>
    )
  }

  return (
    <ul className={compact ? "py-1" : "max-h-56 overflow-y-auto py-1"}>
      {queue.map((song, index) => {
        const isCurrent = current?.id === song.id
        return (
          <li key={song.id} data-queue-item={song.id}>
            <button
              type="button"
              onClick={() => {
                if (isCurrent) toggle()
                else playSong(song)
                onPick?.()
              }}
              className={`flex w-full items-center gap-2.5 text-left transition-colors ${
                compact ? "px-4 py-2" : "px-4 py-2"
              } ${isCurrent ? "bg-gray-50" : "hover:bg-gray-50"}`}
              aria-current={isCurrent ? "true" : undefined}
            >
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-gray-300">
                {index + 1}
              </span>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isCurrent && playing ? (
                  <Pause size={12} className="text-gray-900" />
                ) : (
                  <Play size={12} className={isCurrent ? "text-gray-900" : "text-gray-300"} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${
                    compact ? "text-[13px]" : "text-sm"
                  } ${isCurrent ? "font-medium text-gray-900" : "text-gray-700"}`}
                >
                  {song.title}
                </span>
                <span className="block truncate text-xs text-gray-400">
                  {song.artist}
                  {compact && song.album ? ` · ${song.album}` : ""}
                </span>
              </span>
              {isCurrent && (
                <span className="shrink-0 text-[10px] text-gray-400">正在播放</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
