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
  favorite: boolean
  /** 为空表示还没绑定到音乐接口，前台会置灰不可点 */
  apiId: string | null
}

interface PlayerContextValue {
  current: PlayerSong | null
  playing: boolean
  loading: boolean
  /** 播放失败时的提示文案 */
  error: string | null
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
  /**
   * 重新取一次播放地址并接着播。
   * 为什么需要：播放地址是短时签名的，用户暂停很久再继续时，浏览器会去请求
   * 一个已经过期的地址而直接失败。这里从当前进度续上，不必让用户重新点一遍。
   */
  retryCurrent: () => void
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

  /**
   * 已经为哪首歌自动重取过地址了。
   *
   * 只自动重试一次：地址失效重取能救，网络不通 / 源站没版权重取也救不了，
   * 无限重试只会变成死循环。换歌时重置，所以每首歌都有一次机会。
   */
  const retriedSongId = useRef<number | null>(null)
  /** 当前是否正处在「重取地址」的过程中，避免重试期间的 error 事件覆盖提示 */
  const retrying = useRef(false)

  /**
   * 取播放地址并开始播放。失败时给出原因。
   *
   * `options.force` 让服务端跳过它的内存缓存重新取地址（重试时必须带上，
   * 否则拿回来的还是那条已经失效的地址）；`options.resumeAt` 是续播位置。
   */
  const start = useCallback(
    async (song: PlayerSong, options: { force?: boolean; resumeAt?: number } = {}) => {
      setCurrent(song)
      setError(null)
      setLoading(true)

      const audio = audioRef.current
      if (!audio) return

      try {
        const res = await fetch(
          `/api/music/play?id=${song.id}${options.force ? "&retry=1" : ""}`
        )
        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data.url) {
          setError(data.error || "暂时无法播放这首歌")
          setPlaying(false)
          audio.removeAttribute("src")
          return
        }

        // 续播要在拿到新地址之后再设置：src 一换进度就归零了
        if (options.resumeAt && options.resumeAt > 0) {
          const seekTo = options.resumeAt
          const onLoaded = () => {
            audio.currentTime = seekTo
          }
          audio.addEventListener("loadedmetadata", onLoaded, { once: true })
        }

        audio.src = data.url
        // 点击是用户手势，浏览器允许此时自动播放
        await audio.play()
        setPlaying(true)
      } catch {
        setError("网络异常，暂时无法播放")
        setPlaying(false)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  /** 地址失效时的自动恢复：跳过缓存重取一次，并从断掉的位置接着播 */
  const retryCurrent = useCallback(() => {
    if (!current || retrying.current) return
    if (retriedSongId.current === current.id) return
    retriedSongId.current = current.id
    retrying.current = true
    const resumeAt = audioRef.current?.currentTime ?? 0
    void start(current, { force: true, resumeAt }).finally(() => {
      retrying.current = false
    })
  }, [current, start])

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
      // 换歌了，给新歌一次自动重取的机会
      retriedSongId.current = null
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
    retriedSongId.current = null
    setCurrent(null)
    setPlaying(false)
    setError(null)
    setQueue([])
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      playing,
      loading,
      error,
      queue,
      audioRef,
      play,
      toggle,
      next: () => step(1),
      prev: () => step(-1),
      close,
      retryCurrent,
    }),
    [
      current,
      playing,
      loading,
      error,
      queue,
      play,
      toggle,
      step,
      close,
      retryCurrent,
    ]
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        唯一的 audio 元素挂在这里，整页共用一个播放器。
        onEnded 自动下一首；onError 兜住「地址过期」——签名 URL 会过期，
        用户暂停很久再继续时浏览器就会撞上这种情况。
        这里先自动重取一次地址并从断点续播，重取也失败才提示用户。
      */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => step(1)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          if (!current) return
          // 重取过程中 src 会被换掉，中间的 error 事件不该覆盖最终结论
          if (retrying.current) return
          if (retriedSongId.current !== current.id) {
            retryCurrent()
            return
          }
          setError("播放地址已失效，请重新点击播放")
          setPlaying(false)
        }}
      />
    </PlayerContext.Provider>
  )
}
