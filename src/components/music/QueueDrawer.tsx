"use client"

import { useEffect } from "react"
import { ListOrdered, X } from "lucide-react"
import { usePlayer } from "./player-context"
import QueueList from "./QueueList"

/**
 * **沉浸模式内的播放列表抽屉。**
 *
 * 为什么需要它：原来沉浸层里的列表按钮是 `onClose()` + 打开底部那个 `QueuePanel`，
 * 于是「点播放列表就退回原页面」。而底部面板是 `bottom-0 z-50`、沉浸层是 `z-[60]`，
 * **结构上就盖不到沉浸层上面** —— 所以这不是调 z-index 能解决的，
 * 必须给沉浸层自己一份抽屉。
 *
 * 形态按断点自适应（一套组件）：
 *  - PC（≥768px）：从**右侧滑入**，浮在歌词之上；左侧留半透明遮罩，能看到唱片
 *  - 窄屏：从**底部滑入**，接近整宽 —— 手机上一侧抽屉会占掉大半屏、遮住唱片
 *
 * 选完一首**自动收起**（站长明确要的）：收起来就回到唱片与歌词。
 */
export default function QueueDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { queue, current } = usePlayer()

  /**
   * 打开时把正在播放的那首滚进视野。
   *
   * ⚠️ 这里用 `scrollIntoView` 是**安全的**，与歌词滚动那次踩坑不同：
   * 它只在本抽屉打开时跑一次、目标是本抽屉内部的元素，祖先链上没有别的
   * 可滚动容器（沉浸层是 fixed + overflow-hidden），所以不会误滚页面。
   * 歌词那边每几秒就滚一次、且祖先里确实有可滚动容器，才必须自己写 scrollTop。
   */
  useEffect(() => {
    if (!open || !current) return
    const item = document.querySelector<HTMLElement>(`[data-queue-item="${current.id}"]`)
    item?.scrollIntoView({ block: "nearest" })
  }, [open, current])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-10" role="dialog" aria-modal="true" aria-label="播放列表">
      {/* 遮罩：PC 上只盖左侧，右边是抽屉本身；点它收起 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="收起播放列表"
        className="animate-fade-in absolute inset-0 cursor-default bg-black/20 backdrop-blur-[2px]"
      />

      <div
        className="animate-drawer-in absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl
                   md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
          <ListOrdered size={15} className="shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
            播放列表 · 共 {queue.length} 首
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="收起播放列表"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <QueueList compact onPick={onClose} />
        </div>

        <p className="shrink-0 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
          点某一首会直接切歌并收起列表
        </p>
      </div>
    </div>
  )
}
