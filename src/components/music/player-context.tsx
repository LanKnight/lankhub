"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { nextPlayMode, resolveStep, type PlayMode } from "@/lib/play-order"

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
  /** 当前播放列表（点单曲时 = 那位歌手的歌；点「播放全部」时 = 全站可播的歌） */
  queue: PlayerSong[]
  /** 当前播放模式 */
  mode: PlayMode
  /** 在想随机取一个时用：先把模式切到随机再播放 */
  setMode: (mode: PlayMode) => void
  /** 模式按钮用：按顺序切到下一个模式 */
  cycleMode: () => void
  /**
   * 直接播放某一首（队列是否重建由调用方决定）。
   * 播放列表面板里点某一首用它 —— 那时队列不该变，只换当前曲。
   */
  playSong: (song: PlayerSong) => void
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

/* ------------------------------------------------------------------ *
 * 播放状态的持久化
 *
 * 只存「模式 + 当前哪首歌 + 听到哪了」，不存整份歌曲数据 ——
 * 歌曲信息本来就由服务端每次渲染带下来，存一份只会过期。
 * 读到之后也**不自动播放**：浏览器会拦截没有用户手势的自动播放，
 * 那样只会留下一个看起来坏掉的播放条。
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "lankhub:player"

interface PersistedState {
  mode: PlayMode
  songId: number | null
  position: number
}

function readPersisted(): PersistedState | null {
  // 服务端渲染时没有 window：返回 null，让首屏走默认值
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const mode =
      parsed.mode === "sequential" || parsed.mode === "single" || parsed.mode === "shuffle"
        ? parsed.mode
        : "sequential"
    return {
      mode,
      songId: typeof parsed.songId === "number" ? parsed.songId : null,
      position: typeof parsed.position === "number" && parsed.position > 0 ? parsed.position : 0,
    }
  } catch {
    // 隐私模式 / 存储被禁用 / JSON 损坏：一律当作没存过，不影响播放
    return null
  }
}

function writePersisted(state: PersistedState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存不进去也不该影响播放，静默忽略
  }
}

export function PlayerProvider({
  children,
}: {
  // 用 ReactNode 而不是把卡片写进这个组件：这样页面仍是服务端组件，
  // 卡片墙能被 SSR 出来（首屏不闪、也利于收录）
  children: ReactNode
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /*
   * 用 lazy initializer 读回上次的状态，而不是在 effect 里 setState：
   * 后者会被 React 19 的 `react-hooks/set-state-in-effect` 判为
   * 「同步 setState 触发级联渲染」，项目里别处也都避开了这种写法。
   * 初值只在客户端算（readPersisted 在服务端直接返回 null），
   * 所以首屏也不会有「先渲染默认值再跳成上次值」的闪烁。
   */
  const [saved] = useState(readPersisted)
  const [mode, setModeState] = useState<PlayMode>(saved?.mode ?? "sequential")
  const [current, setCurrent] = useState<PlayerSong | null>(null)
  const [queue, setQueue] = useState<PlayerSong[]>([])
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 随机播放的顺序（存的是歌曲 id）。
   *
   * 用 ref 而不是 state：它只在切歌时被读一次，改动它不需要触发重渲染，
   * 放进 state 反而会让播放条跟着重渲染。
   */
  const shuffleOrder = useRef<number[]>([])
  /**
   * 随机模式下的「上一首」历史。
   *
   * 为什么需要它：随机播放时若「上一首」也随机抽一首，用户按了等于没返回。
   * 有了历史，上一首就是真的回到刚才那首。
   */
  const shuffleHistory = useRef<number[]>([])
  /**
   * 上次听的是哪一首 —— 用 state 而不是 ref：下面「渲染期调整 state」那段
   * 需要读它，而**渲染期读 ref 是禁止的**（`react-hooks/refs` 会报错）。
   */
  const [restoreSongId] = useState<number | null>(saved?.songId ?? null)
  /** 首屏恢复是否已经做过。同样必须是 state —— 要在渲染期读它来判断 */
  const [restored, setRestored] = useState(false)
  /** 首屏恢复的播放进度，等那一首真正开始播时用掉 */
  const pendingPosition = useRef(saved?.position ?? 0)

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

        /*
         * 续播位置的两种来源：
         *  - `options.resumeAt`：地址失效后重试，要接回断掉的位置
         *  - `pendingPosition`：首屏从 localStorage 恢复上次听到哪
         */
        const resumeAt = options.resumeAt || pendingPosition.current
        if (resumeAt && resumeAt > 0) {
          const seekTo = resumeAt
          const onLoaded = () => {
            audio.currentTime = seekTo
          }
          audio.addEventListener("loadedmetadata", onLoaded, { once: true })
        }
        pendingPosition.current = 0

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

  /**
   * 地址失效时的自动恢复：跳过缓存重取一次，并从断掉的位置接着播 */
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

  /** 队列换了就丢掉旧的随机顺序：那些 id 可能已经不在了 */
  const setQueueAndReset = useCallback((list: PlayerSong[]) => {
    setQueue(list)
    shuffleOrder.current = []
    shuffleHistory.current = []
  }, [])

  /** 从某一首开始播，并把队列换成 list（点单曲、「播放全部」都用它） */
  const play = useCallback(
    (song: PlayerSong, list: PlayerSong[]) => {
      setQueueAndReset(list)
      pendingPosition.current = 0
      void start(song)
    },
    [setQueueAndReset, start]
  )

  /** 只换当前曲、不动队列 —— 播放列表面板里点某一首用它 */
  const playSong = useCallback(
    (song: PlayerSong) => {
      pendingPosition.current = 0
      retriedSongId.current = null
      void start(song)
    },
    [start]
  )

  /**
   * 上一首 / 下一首。
   *
   * 三种模式的差别都在这里：
   *  - sequential：走到队列两端就停（不是回到另一头 —— 那是「列表循环」，
   *    站长明确不要这个模式）
   *  - single：手动点下一首仍然换歌，只有**自动播完**才重播同一首（见 onEnded）
   *  - shuffle：按洗好的顺序走；「上一首」走历史，所以是真的回到刚才那首
   */
  const step = useCallback(
    (delta: 1 | -1) => {
      if (!current || queue.length === 0) return

      const outcome = resolveStep({
        mode,
        queueIds: queue.map((s) => s.id),
        currentId: current.id,
        delta,
        shuffleOrderIds: shuffleOrder.current,
        history: shuffleHistory.current,
      })
      shuffleOrder.current = outcome.shuffleOrderIds
      shuffleHistory.current = outcome.history
      if (outcome.nextId === null) return // 顺序播放到底了就停

      const nextSong = queue.find((s) => s.id === outcome.nextId)
      if (!nextSong) return
      retriedSongId.current = null
      pendingPosition.current = 0
      void start(nextSong)
    },
    [current, queue, mode, start]
  )

  /** 自动播完：单曲循环重播同一首，其余情况等于点「下一首」 */
  const handleEnded = useCallback(() => {
    if (mode === "single" && current) {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        void audio.play().catch(() => setPlaying(false))
      }
      return
    }
    step(1)
  }, [mode, current, step])

  const setMode = useCallback((next: PlayMode) => {
    setModeState((prev) => {
      if (prev === next) return prev
      // 换模式时丢掉旧的随机顺序与历史，避免带着上个模式的进度继续
      shuffleOrder.current = []
      shuffleHistory.current = []
      return next
    })
  }, [])

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      shuffleOrder.current = []
      shuffleHistory.current = []
      return nextPlayMode(prev)
    })
  }, [])

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
    shuffleOrder.current = []
    shuffleHistory.current = []
    setCurrent(null)
    setPlaying(false)
    setError(null)
    setQueue([])
  }, [])

  /* ---------------- 持久化：读回上次的模式与当前曲 ---------------- */

  /*
   * 恢复上次那一首。
   *
   * 这里刻意**不用 effect + setState**：React 19 的
   * `react-hooks/set-state-in-effect` 会拦（同步 setState 会触发级联渲染），
   * 项目里别处也都避开了这种写法。改用「渲染期调整 state」这个官方模式 ——
   * 直接按条件 set，React 会立刻用新值重渲染、不会白跑一趟 DOM 提交。
   *
   * 时序上它依赖 queue 已经到位：首屏 queue 是空的，所以这个判断会等到
   * 用户点第一首歌（或将来任何让 queue 有值的时刻）才生效。
   *
   * 刻意**不自动播放**：浏览器会拦截没有用户手势的自动播放，
   * 那样只会留下一个看起来坏掉的播放条。恢复的是一条暂停中的曲目，
   * 用户点一下播放即可，进度也从上次的位置接着走。
   */
  if (!restored) {
    const wanted = restoreSongId
    if (wanted !== null && queue.length > 0) {
      setRestored(true)
      const song = queue.find((s) => s.id === wanted)
      if (song && !current) {
        setCurrent(song)
        setError(null)
      }
    }
  }

  /** 模式或当前曲变化时写回 */
  useEffect(() => {
    if (!restored && restoreSongId === null) return
    writePersisted({
      mode,
      songId: current?.id ?? null,
      position: audioRef.current?.currentTime ?? 0,
    })
  }, [mode, current, restored, restoreSongId])

  /** 进度不放进 state（会让卡片墙重渲染），所以用一个低频定时器定期留存 */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!restored && restoreSongId === null) return
      writePersisted({
        mode,
        songId: current?.id ?? null,
        position: audioRef.current?.currentTime ?? 0,
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [mode, current, restored, restoreSongId])

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      playing,
      loading,
      error,
      queue,
      mode,
      setMode,
      cycleMode,
      playSong,
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
      mode,
      setMode,
      cycleMode,
      playSong,
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
        onEnded 按当前播放模式决定下一首（单曲循环时是重播自己）；
        onError 兜住「地址过期」——签名 URL 会过期，
        用户暂停很久再继续时浏览器就会撞上这种情况。
        这里先自动重取一次地址并从断点续播，重取也失败才提示用户。
      */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={handleEnded}
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
