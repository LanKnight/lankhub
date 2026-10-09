"use client"

import { ChevronDown } from "lucide-react"
import type { RefObject } from "react"
import type { LyricLine } from "@/lib/lrc"

/**
 * 歌词抽屉（从 PlayerBar 拆出来的）。
 *
 * 保持纯展示：解析好的歌词行、当前行下标、滚动容器 ref 都由播放条传入，
 * 这样它不需要碰播放状态，也不必订阅 timeupdate。
 */
export default function LyricsDrawer({
  open,
  onClose,
  title,
  artist,
  lines,
  activeIndex,
  boxRef,
}: {
  open: boolean
  onClose: () => void
  title: string
  artist: string
  lines: LyricLine[]
  activeIndex: number
  boxRef: RefObject<HTMLDivElement | null>
}) {
  if (!open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mb-[68px] px-3 md:px-6">
      <div className="mx-auto max-w-3xl rounded-t-2xl border border-b-0 border-gray-200 bg-white/95 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <span className="truncate text-xs text-gray-400">
            {title} · {artist}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="收起歌词"
          >
            <ChevronDown size={16} />
          </button>
        </div>
        <div ref={boxRef} className="h-56 overflow-y-auto px-6 py-4">
          {lines.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">这首歌暂时没有歌词</p>
          ) : (
            <div className="space-y-3 text-center">
              {lines.map((line, index) => (
                <p
                  key={`${line.time}-${index}`}
                  data-line={index}
                  className={
                    index === activeIndex
                      ? "text-[15px] font-medium text-gray-900 transition-colors"
                      : "text-sm text-gray-400 transition-colors"
                  }
                >
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
