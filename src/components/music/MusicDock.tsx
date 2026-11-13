"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react"

import { usePlayer, type PlayerSong } from "./player-context"

/**
 * 音乐悬浮按钮 + 侧边抽屉。
 *
 * 交互（站长定的）：
 *  - **单击**：从右侧弹出抽屉，可 上一首 / 播放暂停 / 下一首，抽屉里有「进入歌单」
 *  - **双击**：直接进 /music
 *  - 按钮**常驻**，不因"没在播放"而消失 —— 否则不放歌时就再也找不到音乐入口了
 *  - 在 /music 页面里不显示（那一页自己有播放条，两个播放器会打架）
 *  - **未登录时不显示**：歌单是私人的，/music 与 /api/music/play 都要求登录，
 *    给匿名访客一个点了全是 401 的按钮没有意义
 *
 * 为什么按钮与抽屉都在根布局里：
 * `<audio>` 挂在 PlayerProvider 上，只有它在根布局，跨页面导航时才不会被卸载
 * （以前挂在 /music 页面内部，一切换路由歌就停）。
 */
export default function MusicDock() {
  const pathname = usePathname()
  const router = useRouter()
  const { status } = useSession()
  const { current, playing, loading, queue, play, playShuffled, toggle, next, prev, audioRef } =
    usePlayer()

  const [open, setOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 抽屉展开时把焦点给到面板，方便键盘操作
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  // 路由变化时收起抽屉
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // 进度条：只在播放中轮询，停下就停，避免空转
  useEffect(() => {
    if (!playing) {
      setProgress(0)
      return
    }
    const tick = () => {
      const audio = audioRef.current
      if (!audio || !audio.duration || Number.isNaN(audio.duration)) return
      setProgress(Math.min(100, (audio.currentTime / audio.duration) * 100))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [playing, audioRef])

  /**
   * 什么都没播时，抽屉里的「开始播放」。
   *
   * 站长要求：**随机开始**，而不是每次从歌单第一首放起。
   * 用 playShuffled 而不自己 Math.random 取一首：它会把播放模式也设成随机，
   * 这样后续「下一首」也是随机的；自己 random 一首的话模式仍是顺序，
   * 点下一首就跳回列表下一首，感觉像"随机了一次就没了"。
   */
  const startDefault = useCallback(async () => {
    if (queue.length > 0) {
      playShuffled(queue)
      return
    }
    setPreparing(true)
    try {
      const res = await fetch("/api/music/queue")
      const data = await res.json().catch(() => null)
      if (Array.isArray(data) && data.length > 0) {
        playShuffled(data as PlayerSong[])
      }
    } finally {
      setPreparing(false)
    }
  }, [queue, playShuffled])

  /** 单击开抽屉、双击进歌单：用定时器区分，避免单击时立刻跳走 */
  const handleButtonClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      router.push("/music")
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      setOpen((value) => !value)
    }, 220)
  }, [router])

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current)
    }
  }, [])

  // /music 页面不显示（那一页有自己的播放条）；未登录也不显示（歌单是私人的）
  if (pathname === "/music" || pathname.startsWith("/music/")) return null
  if (status !== "authenticated") return null

  return (
    <>
      <button
        type="button"
        onClick={handleButtonClick}
        aria-label={playing ? "音乐（正在播放）" : "音乐"}
        aria-expanded={open}
        title="音乐：单击打开控制，双击进入歌单"
        className="no-print fixed bottom-20 right-6 z-[95] flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-colors hover:bg-gray-50"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : playing ? (
          <span className="relative flex h-11 w-11 items-center justify-center">
            {/* 播放中：一圈细进度环 */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#1a1510 ${progress}%, transparent 0)`,
                opacity: 0.18,
              }}
            />
            <Music2 size={18} />
          </span>
        ) : (
          <Music2 size={18} />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="音乐控制"
          className="no-print fixed bottom-32 right-6 z-[96] w-[19rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-medium text-gray-800">音乐</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="收起"
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={15} />
            </button>
          </div>

          <div className="px-4 py-3">
            {current ? (
              <div className="flex items-center gap-3">
                {current.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.coverUrl}
                    alt=""
                    className="h-12 w-12 rounded-md object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                    <Music2 size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{current.title}</p>
                  <p className="truncate text-xs text-gray-500">{current.artist}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">还没开始播放</p>
            )}

            <div className="mt-3 flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={prev}
                disabled={!current}
                aria-label="上一首"
                className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
              >
                <SkipBack size={18} />
              </button>

              {current ? (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={loading}
                  aria-label={playing ? "暂停" : "播放"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : playing ? (
                    <Pause size={18} />
                  ) : (
                    <Play size={18} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startDefault()}
                  disabled={preparing}
                  className="flex h-11 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
                >
                  {preparing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} />
                  )}
                  开始播放
                </button>
              )}

              <button
                type="button"
                onClick={next}
                disabled={!current}
                aria-label="下一首"
                className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
              >
                <SkipForward size={18} />
              </button>
            </div>

            {playing && (
              <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-gray-900 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <Link
              href="/music"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
            >
              <ListMusic size={15} />
              进入歌单
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
