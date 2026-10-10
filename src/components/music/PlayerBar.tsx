"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronUp,
  ListMusic,
  ListOrdered,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { usePlayer } from "./player-context"
import { findLyricIndex, parseLrc } from "@/lib/lrc"
import LyricsDrawer from "./LyricsDrawer"
import QueuePanel from "./QueuePanel"
import ModeButton from "./ModeButton"
import ImmersivePlayer from "./ImmersivePlayer"

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

/** 歌词抽屉的高度（h-56 + 标题栏），列表面板要避开它 */
const LYRICS_OFFSET = "mb-[284px]"
/** 播放条本身的高度 */
const BAR_OFFSET = "mb-[68px]"

/**
 * 底部固定播放条。
 *
 * 进度/音量故意用本地 state 而不是放进 context：
 * timeupdate 每秒触发多次，放进 context 会让整面卡片墙跟着重渲染。
 * 这里直接操作 audio 元素的 ref。
 *
 * 两个弹出面板（歌词 / 播放列表）由这里统一管，因为它们位置重叠、
 * 同时开就会叠在一起 —— 所以互斥。
 */
export default function PlayerBar() {
  const { current, playing, loading, error, queue, audioRef, toggle, next, prev, close } =
    usePlayer()

  /*
   * 进度状态里带上 songId：换歌时用它推导出「归零」的显示，
   * 而不是在 effect 里 setState 重置 —— 后者会触发级联渲染，也被 lint 拦下。
   */
  const [progress, setProgress] = useState({ songId: -1, time: 0, duration: 0 })
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  /** 当前弹出的是哪个面板；null = 都收起 */
  const [panel, setPanel] = useState<"lyrics" | "queue" | null>(null)
  /** 沉浸式全屏层是否打开 */
  const [immersive, setImmersive] = useState(false)

  const lyricBoxRef = useRef<HTMLDivElement | null>(null)

  // 依赖里带上 current?.id：换歌时重新订阅，闭包里的 songId 才是对的
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const songId = current?.id ?? -1
    const sync = () => {
      setProgress({
        songId,
        time: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      })
    }
    audio.addEventListener("timeupdate", sync)
    audio.addEventListener("loadedmetadata", sync)
    audio.addEventListener("durationchange", sync)
    return () => {
      audio.removeEventListener("timeupdate", sync)
      audio.removeEventListener("loadedmetadata", sync)
      audio.removeEventListener("durationchange", sync)
    }
  }, [audioRef, current?.id])

  // 显示用的进度：不是当前这首歌的数据就当作 0
  const currentTime = progress.songId === (current?.id ?? -1) ? progress.time : 0
  const duration = progress.songId === (current?.id ?? -1) ? progress.duration : 0

  const lyricLines = useMemo(() => parseLrc(current?.lyric), [current?.lyric])
  const activeIndex = findLyricIndex(lyricLines, currentTime)

  // 当前歌词行滚到中间
  useEffect(() => {
    if (panel !== "lyrics" || activeIndex < 0) return
    const box = lyricBoxRef.current
    const line = box?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`)
    if (box && line) {
      box.scrollTo({
        top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2,
        behavior: "smooth",
      })
    }
  }, [activeIndex, panel])

  if (!current) return null

  const seek = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value
    // 立刻反映到界面上，不必等下一次 timeupdate
    setProgress({ songId: current?.id ?? -1, time: value, duration })
  }

  const changeVolume = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = value
    setVolume(value)
    setMuted(value === 0)
  }

  return (
    <>
      {/* 沉浸式全屏层：盖在最上面，播放器状态不变（不是换路由，见该组件注释） */}
      <ImmersivePlayer
        open={immersive}
        onClose={() => setImmersive(false)}
        onOpenQueue={() => setPanel("queue")}
        onOpenLyricsPanel={() => setPanel("lyrics")}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
      />

      {/* 歌词抽屉 */}
      <LyricsDrawer
        open={panel === "lyrics"}
        onClose={() => setPanel(null)}
        title={current.title}
        artist={current.artist}
        lines={lyricLines}
        activeIndex={activeIndex}
        boxRef={lyricBoxRef}
      />

      {/* 播放列表：歌词开着时抬高，避免两个面板重叠 */}
      <QueuePanel
        open={panel === "queue"}
        onClose={() => setPanel(null)}
        offsetClass={panel === "lyrics" ? LYRICS_OFFSET : BAR_OFFSET}
      />

      {/* 播放条 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 md:gap-4 md:px-4">
          {/* 封面 */}
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {current.coverUrl ? (
              // 外部 CDN 域名不固定，用原生 img；已由 CSP 的 img-src 放行
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.coverUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-300">
                <ListMusic size={18} />
              </div>
            )}
          </div>

          {/* 曲目信息 + 报错 */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{current.title}</p>
            {error ? (
              <p className="truncate text-xs text-red-500">{error}</p>
            ) : (
              <p className="truncate text-xs text-gray-500">{current.artist}</p>
            )}
          </div>

          {/* 控制 */}
          <div className="flex shrink-0 items-center gap-1">
            <ModeButton />

            <button
              type="button"
              onClick={prev}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900"
              aria-label="上一首"
            >
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900"
              aria-label="下一首"
            >
              <SkipForward size={18} />
            </button>
          </div>

          {/* 进度（md 以上才显示，移动端空间不够） */}
          <div className="hidden items-center gap-2 md:flex md:w-64 lg:w-80">
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer accent-gray-900"
              aria-label="播放进度"
            />
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-gray-400">
              {formatTime(duration)}
            </span>
          </div>

          {/* 音量（lg 以上才有空间） */}
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <button
              type="button"
              onClick={() => {
                const audio = audioRef.current
                if (!audio) return
                const nextMuted = !muted
                audio.muted = nextMuted
                setMuted(nextMuted)
              }}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-900"
              aria-label={muted ? "取消静音" : "静音"}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-gray-900"
              aria-label="音量"
            />
          </div>

          {/* 播放列表 */}
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "queue" ? null : "queue"))}
            className={`shrink-0 rounded-lg p-2 transition-colors ${
              panel === "queue" ? "text-gray-900" : "text-gray-400 hover:text-gray-900"
            }`}
            aria-label="播放列表"
            aria-expanded={panel === "queue"}
            title={`播放列表（${queue.length} 首）`}
          >
            <ListOrdered size={18} />
          </button>

          {/*
            歌词按钮点开的不是抽屉，而是**沉浸式全屏界面**（左边唱片、右边歌词）。
            原来那个「底部歌词抽屉」没有删掉，仍在：沉浸层里有个
            「在页面内看歌词」的入口，以及沉浸层里点列表图标也会落回抽屉。
          */}
          <button
            type="button"
            onClick={() => setImmersive(true)}
            className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="沉浸式歌词"
            title="沉浸式歌词（唱片 + 歌词）"
          >
            <ChevronUp size={18} />
          </button>

          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900"
            aria-label="关闭播放器"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  )
}
