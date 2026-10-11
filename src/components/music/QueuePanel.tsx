"use client"

import { ChevronDown } from "lucide-react"
import { usePlayer } from "./player-context"
import QueueList from "./QueueList"

/**
 * 非沉浸模式下的**底部播放列表抽屉**。
 *
 * 与歌词抽屉是**互斥**的：两个都从底部弹出、位置几乎一样，同时开会叠在一起，
 * 所以由播放条统一管「当前弹的是哪个」。
 *
 * 列表本体走 `QueueList` —— 与沉浸模式的右侧抽屉共用，避免两份实现漂移。
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
  const { queue } = usePlayer()

  if (!open) return null

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 px-3 md:px-6 ${offsetClass}`}>
      <div className="animate-sheet-up mx-auto max-w-3xl rounded-t-2xl border border-b-0 border-gray-200 bg-white/95 shadow-xl backdrop-blur">
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
        <QueueList />
      </div>
    </div>
  )
}
