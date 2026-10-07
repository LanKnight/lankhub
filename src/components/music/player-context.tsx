"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"

/** 播放器需要的一首歌（由 /music 服务端组件传入） */
export interface PlayerSong {
  id: number
  title: string
  artist: string
  coverUrl: string | null
  lyric: string | null
  link: string | null
  favorite: boolean
  /** 为空表示还没绑定到音乐接口，点播放会给出提示 */
  apiId: string | null
}

interface PlayerContextValue {
  current: PlayerSong | null
  playing: boolean
  loading: boolean
  /** 播放失败时的提示文案 */
  error: string | null
  /** 播放失败但有外链时，给用户一个「去别处听」的出口 */
  fallbackLink: string | null
  /** 当前播放列表（点卡片里的歌时，队列 = 那位歌手的歌） */
  queue: PlayerSong[]
  /**
   * audio 元素的 ref。
   * 故意不做成 currentTime 之类的受控状态：timeupdate 每秒触发好几次，
   * 放进 context 会让整面卡片墙跟着重渲染。播放条自己读这个 ref 即可。
   */
  audioRef: RefObject<HTMLAudioElement | null>
  play: (song: PlayerSong, queue: PlayerSong[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  close: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer 必须在 PlayerProvider 内使用")
  return ctx
}

export function PlayerProvider({
  children,
}: {
  // 用 ReactNode 而不是把卡片写进这个组件：这样页面仍是服务端组件，
  // 卡片墙能被 SSR 出来（首屏不闪、也利于收录）
  children: ReactNode
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [current, setCurrent] = useState<PlayerSong | null>(null)
  const [queue, setQueue] = useState<PlayerSong[]>([])
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackLink, setFallbackLink] = useState<string | null>(null)

  /** 取播放地址并开始播放。失败时给出原因与外链出口 */
  const start = useCallback(async (song: PlayerSong) => {
    setCurrent(song)
    setError(null)
    setFallbackLink(null)
    setLoading(true)

    const audio = audioRef.current
    if (!audio) return

    try {
      const res = await fetch(`/api/music/play?id=${song.id}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.url) {
        setError(data.error || "暂时无法播放这首歌")
        setFallbackLink(data.fallback ?? song.link ?? null)
        setPlaying(false)
        audio.removeAttribute("src")
        return
      }

      audio.src = data.url
      // 点击是用户手势，浏览器允许此时自动播放
      await audio.play()
      setPlaying(true)
    } catch {
      setError("网络异常，暂时无法播放")
      setFallbackLink(song.link)
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const play = useCallback(
    (song: PlayerSong, list: PlayerSong[]) => {
      setQueue(list)
      void start(song)
    },
    [start]
  )

  const step = useCallback(
    (delta: number) => {
      if (!current || queue.length === 0) return
      const index = queue.findIndex((s) => s.id === current.id)
      if (index < 0) return
      // 循环播放：到末尾回到开头
      const nextIndex = (index + delta + queue.length) % queue.length
      void start(queue[nextIndex])
    },
    [current, queue, start]
  )

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) void audio.play().then(() => setPlaying(true)).catch(() => {})
    else {
      audio.pause()
      setPlaying(false)
    }
  }, [current])

  const close = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
    }
    setCurrent(null)
    setPlaying(false)
    setError(null)
    setFallbackLink(null)
    setQueue([])
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      playing,
      loading,
      error,
      fallbackLink,
      queue,
      audioRef,
      play,
      toggle,
      next: () => step(1),
      prev: () => step(-1),
      close,
    }),
    [current, playing, loading, error, fallbackLink, queue, play, toggle, step, close]
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        唯一的 audio 元素挂在这里，整页共用一个播放器。
        onEnded 自动下一首；onError 兜住「地址过期」这种情况（签名 URL 会过期）
      */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => step(1)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          if (current) {
            setError("播放地址已失效，请重新点击播放")
            setPlaying(false)
          }
        }}
      />
    </PlayerContext.Provider>
  )
}
