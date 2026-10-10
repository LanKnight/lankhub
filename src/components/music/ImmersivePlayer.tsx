"use client"

import { useEffect, useMemo, useRef } from "react"
import {
  ChevronDown,
  ListMusic,
  ListOrdered,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react"
import { findLyricIndex, parseLrc } from "@/lib/lrc"
import { usePlayer } from "./player-context"
import ModeButton from "./ModeButton"

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

/**
 * 沉浸式听歌界面：全屏层，左边唱片、右边歌词，下面是控制。
 *
 * 为什么是**全屏层**而不是一个新路由（`/music/immersive`）：
 * 播放器上下文（唯一的那个 `<audio>`）挂在 `/music` 页面内部，
 * 一旦换成另一个路由，React 会卸载这棵子树 → `<audio>` 被销毁 → 歌当场停。
 * 所以「进入沉浸式」本质是同一页面的视图切换，不是页面跳转。
 * 代价是没有独立 URL，后退键不会「退出沉浸式」——所以右上角给了关闭按钮、
 * 也支持 Esc。
 *
 * 桌面左右分栏；窄屏自动变成上下堆叠（唱片在上、歌词在下），
 * 否则右边那栏会被挤成一条缝。
 */
export default function ImmersivePlayer({
  open,
  onClose,
  onOpenQueue,
  onOpenLyricsPanel,
  currentTime,
  duration,
  onSeek,
}: {
  open: boolean
  onClose: () => void
  /** 打开底部那条播放列表；沉浸层收起后由播放条接管 */
  onOpenQueue: () => void
  /** 打开底部那条歌词抽屉 */
  onOpenLyricsPanel: () => void
  currentTime: number
  duration: number
  onSeek: (value: number) => void
}) {
  const { current, playing, loading, error, toggle, next, prev } = usePlayer()
  const lyricBoxRef = useRef<HTMLDivElement | null>(null)

  const lyricLines = useMemo(() => parseLrc(current?.lyric), [current?.lyric])
  const activeIndex = findLyricIndex(lyricLines, currentTime)

  /** 当前行滚到中间 */
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const box = lyricBoxRef.current
    const line = box?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`)
    if (box && line) {
      box.scrollTo({
        top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2,
        behavior: "smooth",
      })
    }
  }, [activeIndex, open])

  /** Esc 退出；左右方向键切歌 —— 沉浸层里没有别的东西，用方向键很自然 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
      else if (e.key === " ") {
        // 空格是播放/暂停，但要避开输入框与按钮自身的空格语义
        const target = e.target as HTMLElement | null
        if (target?.closest("input, textarea, [contenteditable]")) return
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, prev, next, toggle])

  /** 打开时锁住页面滚动，否则背后那面卡片墙会跟着滚 */
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open || !current) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={`正在播放 ${current.title}`}
    >
      {/*
        背景：用封面自身做一层极淡的模糊铺底。
        站点是白底水墨，所以不铺黑 —— 而是把封面高斯模糊到几乎看不出原图，
        只在白底上留一点色温，避免整屏纯白的单调。
      */}
      {current.coverUrl && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.coverUrl}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.16] blur-3xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/80 to-white" />
        </div>
      )}

      {/* 顶栏 */}
      <div className="relative flex shrink-0 items-center gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{current.title}</p>
          <p className="truncate text-xs text-gray-500">{current.artist}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900"
          aria-label="退出沉浸式"
          title="退出沉浸式（Esc）"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {/* 主体：桌面左右分栏，窄屏上下堆叠 */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-2 md:flex-row md:gap-12 md:px-12 lg:gap-16">
        {/* 左：唱片 */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="relative aspect-square w-40 sm:w-48 md:w-64 lg:w-72">
            {/*
              黑胶本体：深色底 + 几道同心纹路，全用 CSS 画，不需要额外图片资源。
              封面**不铺在盘面上**，而是放在中心那张圆标里 —— 现实中的唱片就是
              「黑胶 + 中心贴纸」，而且这样不必再叠一层径向遮罩去假装中间的洞，
              少一层图、少一处会错位的地方。

              旋转用 CSS 动画（transform 走合成层，比 JS 每帧改样式省得多）。
              `animation-play-state` 跟着播放状态 —— 暂停时唱片就停住，
              这个细节很加分。全局的 prefers-reduced-motion 加上下面那条
              针对 .animate-disc-spin 的规则会把它压成静止，不会变成怪东西。
            */}
            <div
              className={`absolute inset-0 rounded-full shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] ${
                playing ? "animate-disc-spin" : "animate-disc-spin [animation-play-state:paused]"
              }`}
              style={{
                backgroundColor: "#1c1c1e",
                backgroundImage:
                  "repeating-radial-gradient(circle at center, rgba(255,255,255,0.07) 0 1px, rgba(0,0,0,0) 1px 5px)",
              }}
            >
              {/* 中心圆标（唱片贴纸）与轴心 */}
              <div className="absolute inset-[31.5%] overflow-hidden rounded-full bg-gray-100 ring-1 ring-black/20">
                {current.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <ListMusic size={26} />
                  </div>
                )}
              </div>
              <div className="absolute left-1/2 top-1/2 h-[5%] w-[5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-inner" />
            </div>
          </div>

          {/* 唱片下方只放一行状态；歌名与歌手已在顶栏，不重复 */}
          {error && (
            <p className="mt-4 max-w-[16rem] text-center text-xs text-red-500">{error}</p>
          )}
        </div>

        {/* 右：歌词 */}
        <div
          ref={lyricBoxRef}
          className="min-h-0 w-full flex-1 overflow-y-auto py-4 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] md:max-w-lg md:py-10"
        >
          {lyricLines.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">
              {current.lyric ? "歌词暂时无法解析" : "这首歌暂时没有歌词"}
            </p>
          ) : (
            <div className="space-y-4 text-center md:text-left">
              {lyricLines.map((line, index) => (
                <p
                  key={`${line.time}-${index}`}
                  data-line={index}
                  className={
                    index === activeIndex
                      ? "text-base font-medium leading-relaxed text-gray-900 transition-colors md:text-lg"
                      : "text-sm leading-relaxed text-gray-400 transition-colors md:text-base"
                  }
                >
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底栏：控制 */}
      <div className="relative shrink-0 border-t border-gray-100 bg-white/80 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {/* 进度 */}
          <div className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-gray-900"
              aria-label="播放进度"
            />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-gray-400">
              {formatTime(duration)}
            </span>
          </div>

          {/* 按钮：与底部播放条同一套能力，不新增概念 */}
          <div className="flex items-center justify-center gap-2 md:gap-4">
            <ModeButton size={18} />
            <button
              type="button"
              onClick={prev}
              className="rounded-lg p-2.5 text-gray-500 transition-colors hover:text-gray-900"
              aria-label="上一首"
            >
              <SkipBack size={22} />
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={loading}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-lg p-2.5 text-gray-500 transition-colors hover:text-gray-900"
              aria-label="下一首"
            >
              <SkipForward size={22} />
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenQueue()
              }}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900"
              aria-label="播放列表"
              title="播放列表"
            >
              <ListOrdered size={18} />
            </button>
          </div>

          {/* 回到底部那条歌词抽屉 —— 沉浸层是全屏的，抽屉进不来 */}
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenLyricsPanel()
            }}
            className="mx-auto text-[11px] text-gray-400 transition-colors hover:text-gray-600"
          >
            在页面内看歌词
          </button>
        </div>
      </div>
    </div>
  )
}
