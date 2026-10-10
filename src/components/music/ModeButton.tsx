"use client"

import { ArrowRight, Repeat, Shuffle } from "lucide-react"
import { usePlayer } from "./player-context"
import { PLAY_MODE_LABEL, type PlayMode } from "@/lib/play-order"

/** 每个播放模式对应的图标 */
const MODE_ICON: Record<PlayMode, typeof ArrowRight> = {
  sequential: ArrowRight,
  single: Repeat,
  shuffle: Shuffle,
}

/**
 * 播放模式按钮：点一下切到下一个模式。
 *
 * 抽成组件是因为底部播放条与沉浸式界面各要一个 ——
 * 各写一遍的话，哪天加了第四个模式就会漏改一处（静默不一致）。
 */
export default function ModeButton({ size = 17 }: { size?: number }) {
  const { mode, cycleMode } = usePlayer()
  const Icon = MODE_ICON[mode]

  return (
    <button
      type="button"
      onClick={cycleMode}
      className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900"
      aria-label={`播放模式：${PLAY_MODE_LABEL[mode]}，点击切换`}
      title={PLAY_MODE_LABEL[mode]}
    >
      <Icon size={size} />
    </button>
  )
}
