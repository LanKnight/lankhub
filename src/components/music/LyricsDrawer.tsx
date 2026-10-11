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
        {/*
          上下留白约等于容器高度的一半（h-56 = 224px → py 各 112px），
          这样第一行与最后一行也能滚到正中间。

          `relative` 是必需的：滚动时用 `line.offsetTop` 定位，
          而 offsetTop 相对的是最近的**定位祖先** —— 少了它会算错位置。

          不需要再把内容撑高（加过 min-h-[28rem]，那是用 scrollIntoView 时的
          权宜之计；现在直接写 scrollTop，没溢出也不会误滚祖先）。
        */}
        <div
          ref={boxRef}
          className="relative h-56 overflow-y-auto px-6 py-[7rem] [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]"
        >
          <div>
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
    </div>
  )
}
