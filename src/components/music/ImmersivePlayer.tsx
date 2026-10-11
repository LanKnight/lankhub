"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  currentTime,
  duration,
  onSeek,
}: {
  open: boolean
  onClose: () => void
  /** 打开底部那条播放列表；沉浸层收起后由播放条接管 */
  onOpenQueue: () => void
  currentTime: number
  duration: number
  onSeek: (value: number) => void
}) {
  const { current, playing, loading, error, toggle, next, prev } = usePlayer()
  const lyricBoxRef = useRef<HTMLDivElement | null>(null)
  /** 歌词容器的可视高度，用来算上下留白（见下面的注释） */
  const [lyricBoxHeight, setLyricBoxHeight] = useState(0)

  const lyricLines = useMemo(() => parseLrc(current?.lyric), [current?.lyric])
  const activeIndex = findLyricIndex(lyricLines, currentTime)

  /** 量出歌词容器的高度 */
  useEffect(() => {
    const box = lyricBoxRef.current
    if (!box || !open) return
    const measure = () => setLyricBoxHeight(box.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [open])

  /**
   * 把当前行滚到歌词框的正中间。
   *
   * ⚠️ **不能用 `scrollIntoView`。** 它按定义会沿祖先链**逐个滚动所有可滚动的容器**
   * —— 不只滚歌词框，还会把**页面本身**也滚起来（好把目标带进视口中间）。
   * 页面一滚，`relative` 定位的顶栏与整个主体就跟着往上走，
   * 表现就是「滚歌词的时候唱片也跟着滚上去了」。
   *
   * 直接写 `scrollTop` 只可能影响这一个元素，不触碰任何祖先，也没有平滑
   * 滚动被其它滚动打断的问题。
   *
   * `relative` + `offsetTop`：offsetTop 是相对最近的**定位祖先**的，
   * 所以歌词框必须是 `relative`（已加），否则会相对更外层的祖先算，数值就错了。
   *
   * 依赖里带上 lyricLines：切歌时歌词整体换掉，当前行可能没变（都是第 0 行），
   * 那时 activeIndex 不变、effect 不会重跑，得靠歌词本身变化把它带起来。
   */
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const box = lyricBoxRef.current
    const line = box?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`)
    if (!box || !line) return
    box.scrollTo({
      top: line.offsetTop - (box.clientHeight - line.offsetHeight) / 2,
      behavior: "smooth",
    })
  }, [activeIndex, open, lyricLines])

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

      {/*
        顶栏。
        歌名与歌手**只在移动端**留在这里 —— 那边空间紧，塞到唱片下面会把歌词
        挤得更矮。PC 上移到唱片下方（见左边那一列），顶栏只剩退出按钮。
      */}
      <div className="relative flex shrink-0 items-center gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0 md:hidden">
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
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-4 py-2 md:flex-row md:gap-12 md:px-10 lg:gap-16">
        {/* 左：唱片 */}
        <div className="flex shrink-0 flex-col items-center">
          {/*
            尺寸：唱片要比原来大一倍左右。窄屏另有小档位（那里是上下堆叠，
            唱片太大会把歌词挤没）。
          */}
          <div className="relative aspect-square w-52 sm:w-64 md:w-[26rem] lg:w-[30rem]">
            {/*
              黑胶本体：深色底 + 几道同心纹路，全用 CSS 画，不需要额外图片资源。

              封面**同时**出现在两处：盘面（透过纹路看，有唱片的味道）
              与中心圆标（清晰可见）。原来只放在圆标里、而圆标只占盘面 37%，
              唱片一放大就显得图片很小 —— 现在盘面铺底 + 圆标放大到 50%。

              旋转用 CSS 动画（transform 走合成层，比 JS 每帧改样式省得多）。
              暂停靠 `is-paused` 这个类，**不是**再叠一个
              `[animation-play-state:paused]` 工具类 —— 那样两条规则特异性相同，
              谁生效取决于打包顺序，实测会被 animation 简写覆盖掉（唱片停不下来）。
            */}
            <div
              className={`absolute inset-0 rounded-full shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] animate-disc-spin ${
                playing ? "" : "is-paused"
              }`}
              style={{
                backgroundColor: "#1c1c1e",
                // 顺序：纹路在上、封面在下（封面被纹路压着，像透过黑胶看过去）
                backgroundImage: current.coverUrl
                  ? `repeating-radial-gradient(circle at center, rgba(255,255,255,0.07) 0 1px, rgba(0,0,0,0) 1px 5px), url(${current.coverUrl})`
                  : "repeating-radial-gradient(circle at center, rgba(255,255,255,0.07) 0 1px, rgba(0,0,0,0) 1px 5px)",
                backgroundSize: current.coverUrl ? "auto, cover" : undefined,
                backgroundPosition: "center",
                backgroundRepeat: "repeat, no-repeat",
              }}
            >
              {/*
                中心圆标：占盘面 50%（原来 37%）。
                用 w-1/2 h-1/2 + 居中定位，而不是 inset-[31.5%] ——
                后者是「正方形套正方形」，圆形标签的真实直径只有盘面的 37%，
                想让它精确占一半，直接给宽高比例反而更清楚。
              */}
              <div className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/20">
                {current.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-300">
                    <ListMusic size={44} />
                  </div>
                )}
              </div>
              <div className="absolute left-1/2 top-1/2 h-[4%] w-[4%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-inner" />
            </div>
          </div>

          {/*
            歌名与歌手（PC 才显示）：与旋转的唱片居中对称，最像播放器。
            移动端不显示 —— 那边在顶栏里，把高度留给歌词。
          */}
          <div className="mt-6 hidden max-w-[26rem] text-center md:block lg:mt-8">
            <p className="truncate text-lg font-medium text-gray-900 lg:text-xl">
              {current.title}
            </p>
            <p className="mt-1 truncate text-sm text-gray-500">{current.artist}</p>
          </div>

          {error && (
            <p className="mt-4 max-w-[16rem] text-center text-xs text-red-500">{error}</p>
          )}
        </div>

        {/*
          右：歌词。

          上下留白必须**约等于容器高度的一半**，否则第一行与最后一行无法居中
          （滚到顶就是极限）。留白按实测容器高度动态算，而不是写死 py-[38vh]。

          `relative` 是必需的：滚动时用 `line.offsetTop` 定位，
          而 offsetTop 是相对最近的**定位祖先**的 —— 少了它，数值会相对更外层的
          祖先算，滚出来的位置就是错的。

          注意**不需要**再把内容撑高（之前加过一个「两倍容器高」的 minHeight，
          那是在用 scrollIntoView 时的权宜之计；现在直接写 scrollTop，
          没有溢出也不会误滚祖先）。
        */}
        <div
          ref={lyricBoxRef}
          className="relative min-h-0 w-full flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)] md:max-w-lg"
        >
          <div
            style={{
              paddingTop: lyricBoxHeight ? lyricBoxHeight / 2 : 0,
              paddingBottom: lyricBoxHeight ? lyricBoxHeight / 2 : 0,
            }}
          >
            {lyricLines.length === 0 ? (
              <p className="text-center text-sm text-gray-400">
                {current.lyric ? "歌词暂时无法解析" : "这首歌暂时没有歌词"}
              </p>
            ) : (
              <div className="space-y-4 px-2 text-center">
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
        </div>
      </div>
    </div>
  )
}
