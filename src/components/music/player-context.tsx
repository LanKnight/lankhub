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
import {
  buildShuffleOrder,
  nextPlayMode,
  peekNextSong,
  resolveStep,
  type PlayMode,
} from "@/lib/play-order"
import { MUSIC_ERROR_KIND, type MusicErrorCode } from "@/lib/music-api"

/**
 * 暂时性失败最多重试几次（之后才换歌）。
 *
 * 「暂时性」= 配额用完、上游 503、超时、被限流 —— 这些等一下可能就好。
 * 「永久性」= 没版权、没绑定、参数错 —— 重试没有意义，立刻换歌。
 * 分类见 src/lib/music-api.ts 的 MUSIC_ERROR_KIND。
 */
const TRANSIENT_RETRY_MAX = 2

/** 重试前的退避（毫秒）。指数退避：立刻重试对限流场景只会更糟 */
const RETRY_BACKOFF_MS = [600, 1500]

/**
 * 连续跳过多少首就停下来。
 *
 * ⚠️ 这是**防死循环烧配额**的关键：如果队列里每首都播不了
 * （第三方整体挂了、或全都没版权），「播不了就跳下一首」会一路跳到底。
 * 有上限之后最坏只跳这么多次，然后停下并明确告知用户。
 */
const MAX_CONSECUTIVE_SKIPS = 5

/** 播放器需要的一首歌（由 /music 服务端组件传入） */
export interface PlayerSong {
  id: number
  title: string
  artist: string
  /** 专辑名（绑定后才有）。播放列表里用来区分同名不同版本 */
  album: string | null
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
  /** 播放失败时的提示文案（红色） */
  error: string | null
  /**
   * 信息类提示（灰色），与 error 分开。
   *
   * 目前只有一种：「已跳过 N 首无法播放的歌」。
   * 它不是错误（当前这首正在正常播），用红色会让人以为出故障了；
   * 但也不能不说 —— 否则用户会以为播放器莫名其妙从中间开始放。
   */
  notice: string | null
  /**
   * 播放失败是否「值得重试」。
   *
   * 播放条据此决定给不给「重试」按钮：永久失败（没版权）给重试按钮是骗人的，
   * 点了还是失败。
   */
  errorRetryable: boolean
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
  /**
   * 随机播放：从队列里随机挑一首当起点，并当场洗好顺序。
   *
   * 与 `play(list[0], list)` + `setMode("shuffle")` 的区别在于**起点**：
   * 后者永远从第一首开始，那正是「随机播放第一首固定」的原因。
   */
  playShuffled: (queue: PlayerSong[]) => void
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
  /**
   * 手动重试当前这首（失败提示里的「重试」按钮）。
   * 与 retryCurrent 的区别：它**不受「每首只自动重试一次」的限制** ——
   * 那是给自动恢复用的闸门，用户主动点重试不该被它挡住。
   */
  retryManually: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer 必须在 PlayerProvider 内使用")
  return ctx
}

/** 取播放地址的结果。抽出来是为了让「预取」与「正常播放」共用同一段解析逻辑 */
type FetchedUrl =
  | { ok: true; url: string }
  | { ok: false; error: string; code: MusicErrorCode | null }

export function PlayerProvider({
  children,
}: {
  // 用 ReactNode 而不是把卡片写进这个组件：这样页面仍是服务端组件，
  // 卡片墙能被 SSR 出来（首屏不闪、也利于收录）
  children: ReactNode
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [mode, setModeState] = useState<PlayMode>("sequential")
  const [current, setCurrent] = useState<PlayerSong | null>(null)
  const [queue, setQueue] = useState<PlayerSong[]>([])
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorRetryable, setErrorRetryable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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
   * 已经为哪首歌自动重取过地址了。
   *
   * 只自动重试一次：地址失效重取能救，网络不通 / 源站没版权重取也救不了，
   * 无限重试只会变成死循环。换歌时重置，所以每首歌都有一次机会。
   */
  const retriedSongId = useRef<number | null>(null)
  /** 当前是否正处在「重取地址」的过程中，避免重试期间的 error 事件覆盖提示 */
  const retrying = useRef(false)

  /**
   * ★★ 请求代际标记：修「界面切到下一首但声音还是上一首」的核心。
   *
   * 病根：`start()` 里 `setCurrent(song)` 在 await **之前**执行，
   * 而 `audio.src = url` 在 await **之后**。于是取地址的那几百毫秒里，
   * 界面已经显示新歌、音源却还是旧的；快速连点时更糟 ——
   * 多个 start() 叠着跑，而**响应回来的顺序不保证与发出顺序一致**，
   * 晚到的旧响应会把音源改回去，造成界面与声音彻底错位。
   *
   * 解法：每次 start() 领一个自增序号，await 回来后先确认「我还是最新那次吗」，
   * 不是就直接放弃（不碰 audio、不改任何 state）。
   */
  const startGen = useRef(0)
  /** 上一个未完成的取地址请求，发起新的时把它取消掉 */
  const abortRef = useRef<AbortController | null>(null)

  /** 暂时性失败的重试计数（针对同一首歌，成功开播或换歌时归零） */
  const retryCount = useRef(0)
  /** 重试定时器。切歌/关闭时必须清掉，否则旧定时器会在新歌上触发 */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 连续跳过了几首（成功开播后归零）。见 MAX_CONSECUTIVE_SKIPS */
  const consecutiveSkips = useRef(0)
  /**
   * 这一轮「跳过」的歌名。
   *
   * 为什么需要它：永久失败（没版权）会直接换下一首，而 `start()` 开头会
   * `setError(null)` —— 如果每次跳过都单独报一句错，那句错会在下一首开始加载的
   * 瞬间被清掉，用户只看到一闪。**实测就是这样：诊断显示跳到了下一首、
   * 而页面上一条错误提示都没有**，用户会以为播放器坏了。
   *
   * 所以改成「累积起来，等落定再一次性说明」：
   *   - 一直跳 → 到上限时提示「连续 N 首都无法播放」
   *   - 跳着跳着播上了 → 提示「已跳过 X 首（无版权）」
   *   - 一次就成功 → 没有这条提示
   */
  const skippedTitles = useRef<string[]>([])

  /**
   * 预取到的下一首播放地址。
   *
   * 只存 **1 首**：第三方有「60 次 / 5 分钟」的限流，我们自设闸门 45 次，
   * 预取太多会把配额烧光，反而让真正要播的那首拿不到地址。
   * 命中它的条件是 songId 相同 —— 用户切歌顺序变了就失效，这没问题：
   * 失效只是退化成「老老实实等一次接口」。
   */
  const prefetched = useRef<{ songId: number; url: string } | null>(null)
  /** 预取请求的代际，避免晚到的旧预取结果覆盖新的 */
  const prefetchGen = useRef(0)

  /*
   * `current` / `queue` / `mode` 的 ref 镜像。
   *
   * 为什么需要：异步回调（失败分流、预取、重试定时器）里必须拿到**当下**的值，
   * 而闭包捕获的是它们被创建时的旧值 —— 那正是竞态的另一种形态，而且更难察觉
   * （表现为「用上一首的列表去算下一首」）。
   *
   * 刻意声明在所有 useCallback **之前**：虽然 JS 的暂时性死区让「先引用后声明」
   * 在渲染期不报错（回调只在渲染后才执行），但那是靠时序侥幸，改天有人在渲染期
   * 调一次就崩。放在前面是明确且无隐患的。
   */
  const currentRef = useRef<PlayerSong | null>(null)
  const queueRef = useRef<PlayerSong[]>([])
  const modeRef = useRef<PlayMode>("sequential")

  /** `start` 的 ref：`step` 要用它，而 `start` 内部又要调 `step`（失败换歌）—— 循环靠它打断 */
  const startRef = useRef<
    | ((
        song: PlayerSong,
        options?: { force?: boolean; resumeAt?: number; isRetry?: boolean }
      ) => Promise<void>)
    | null
  >(null)
  /** `step` 的 ref 同理（`handleFailure` 要跳下一首） */
  const stepRef = useRef<((delta: 1 | -1) => void) | null>(null)

  /**
   * 取一首歌的播放地址。
   *
   * 失败时把服务端给的 `code` 带回来（播放器据此决定重试还是换歌）。
   * 老服务端/异常响应可能没有 code，那时返回 null，由调用方按「值得重试」处理 ——
   * 比误判成永久失败更安全：最多多试两次，而误判成永久会直接跳过一首能播的歌。
   */
  const fetchUrl = useCallback(
    async (song: PlayerSong, signal: AbortSignal, force: boolean): Promise<FetchedUrl> => {
      /*
       * 先用预取缓存。命中就完全省掉一次接口往返 —— 这是「切歌延迟」的主要来源。
       * 用完立刻清掉：签名地址是一次性的，留着也只会被下次覆盖。
       */
      const hit = prefetched.current
      if (!force && hit && hit.songId === song.id) {
        prefetched.current = null
        return { ok: true, url: hit.url }
      }

      try {
        const res = await fetch(`/api/music/play?id=${song.id}${force ? "&retry=1" : ""}`, {
          signal,
        })
        const data = (await res.json().catch(() => ({}))) as {
          url?: string
          error?: string
          code?: MusicErrorCode
        }
        if (res.ok && data.url) return { ok: true, url: data.url }
        return {
          ok: false,
          error: data.error || "暂时无法播放这首歌",
          code: data.code ?? null,
        }
      } catch (err) {
        // 主动取消（用户切歌了）不算失败，交给调用方按代际判断后丢弃
        if (err instanceof DOMException && err.name === "AbortError") {
          return { ok: false, error: "已取消", code: null }
        }
        return { ok: false, error: "网络异常，暂时无法播放", code: "upstream_error" }
      }
    },
    []
  )

  /**
   * 预取「下一首」的播放地址。
   *
   * 只在**当前歌成功开播之后**才调用 —— 失败时预取等于白耗配额。
   * 拿到结果也不会自动播，只是放进 prefetched，等用户真的切过去时省掉一次往返。
   *
   * 依赖 ref 而不是 state：这里要拿到「当下的」current/queue/mode，
   * 而不是调用那一刻被闭包捕获的旧值（那正是竞态的另一种形态）。
   */
  const prefetchNext = useCallback(async () => {
    const song = currentRef.current
    const list = queueRef.current
    if (!song || list.length === 0) return

    /*
     * ⚠️ 用 peekNextSong 而**不是** resolveStep。
     *
     * 后者在随机模式下会把当前歌压进 history —— 那等于预取顺手「前进」了一步，
     * 之后真正点下一首时算出来的歌就可能与预取的不是同一首（预取永远打不中、
     * 白耗第三方配额），随机播放的返回顺序也会错乱。
     * 我第一版就是直接调了 resolveStep 并丢掉返回值，正是这个错误。
     */
    const nextId = peekNextSong({
      mode: modeRef.current,
      queueIds: list.map((s) => s.id),
      currentId: song.id,
      delta: 1,
      shuffleOrderIds: shuffleOrder.current,
      history: shuffleHistory.current,
    })
    // 顺序播放走到头、或只有一首歌（下一首就是自己）时不必预取
    if (nextId === null || nextId === song.id) return

    const next = list.find((s) => s.id === nextId)
    if (!next) return

    const gen = ++prefetchGen.current
    const controller = new AbortController()
    // 预取失败**不提示、不重试**：它只是优化，失败了退化成「切歌时等一次接口」
    const result = await fetchUrl(next, controller.signal, false)
    // 期间用户又切歌了 → 丢弃（否则会把过期的地址喂给别的歌）
    if (gen !== prefetchGen.current) return
    if (result.ok) prefetched.current = { songId: next.id, url: result.url }
  }, [fetchUrl])

  /**
   * 失败分流 —— 「播不了怎么办」的**唯一决策点**。
   *
   * | 原因 | 归类 | 处理 |
   * | :--- | :--- | :--- |
   * | 没版权 / 没绑定 / 参数错 | 永久 | 立刻换下一首，不重试 |
   * | 配额用完 / 上游 503 / 超时 / 限流 | 暂时 | 退避重试最多 2 次，仍失败才换歌 |
   * | 没登录 | 永久 | **停止**（继续跳只会一路跳到上限） |
   *
   * 还有一道保险：连续跳过 MAX_CONSECUTIVE_SKIPS 首就停下并提示，
   * 避免「队列里每首都播不了」时一路跳到底、把第三方配额烧光。
   */
  const handleFailure = useCallback(
    async (song: PlayerSong, message: string, code: MusicErrorCode | null) => {
      const kind = code ? MUSIC_ERROR_KIND[code] : "transient"

      // ---- 没登录：停下，别自动跳 ----
      if (code === "unauthorized") {
        setError("登录已失效，请重新登录后再听")
        setErrorRetryable(false)
        return
      }

      // ---- 暂时性失败：退避重试 ----
      if (kind === "transient" && retryCount.current < TRANSIENT_RETRY_MAX) {
        const attempt = retryCount.current
        retryCount.current += 1
        const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]
        setError(`${message}（正在重试 ${retryCount.current}/${TRANSIENT_RETRY_MAX}…）`)
        setErrorRetryable(true)

        retryTimer.current = setTimeout(() => {
          retryTimer.current = null
          /*
           * 用 startRef 而不是直接调 start：定时器触发时闭包里的 start
           * 可能已经不是最新的那个（它依赖 fetchUrl 等），而切歌后我们
           * 也不想让旧定时器去播新的歌 —— 所以先确认「当前还是这首歌」。
           */
          if (currentRef.current?.id !== song.id) return
          void startRef.current?.(song, { force: true, isRetry: true })
        }, delay)
        return
      }

      // ---- 永久性失败，或暂时性失败已重试到头：换下一首 ----
      // 注：配额耗尽时换歌没用（下一首同样取不到地址），所以到上限就直接停
      if (code === "quota_exhausted") {
        setError("音乐接口的调用配额用完了，请过几分钟再试")
        setErrorRetryable(true)
        setPlaying(false)
        return
      }

      consecutiveSkips.current += 1
      skippedTitles.current.push(song.title)

      if (consecutiveSkips.current > MAX_CONSECUTIVE_SKIPS) {
        /*
         * 防死循环：连续这么多首都失败，说明不是单首歌的问题
         * （多半是第三方整体挂了，或整个队列都没版权）。
         * 停下并明确说明，而不是继续跳下去把配额烧光。
         */
        const names = skippedTitles.current.slice(0, MAX_CONSECUTIVE_SKIPS).join("、")
        setError(
          `连续 ${MAX_CONSECUTIVE_SKIPS} 首都无法播放，可能音乐接口出了问题（${names}…）`
        )
        setErrorRetryable(true)
        setPlaying(false)
        return
      }

      /*
       * 还有下一首 → 静默跳过。
       *
       * **刻意不在这里 setError**：紧接着的 start() 会 setError(null)，
       * 那句提示只会闪一下（实测确认过：跳到了下一首，而页面上一条提示都没有）。
       * 改由「落定时统一说明」——见 start() 成功开播后的处理。
       */
      setPlaying(false)
      stepRef.current?.(1)
    },
    []
  )

  /** 取地址并开始播放。失败时交给 handleFailure 分流 */
  const start = useCallback(
    async (
      song: PlayerSong,
      options: { force?: boolean; resumeAt?: number; isRetry?: boolean } = {}
    ) => {
      // 领一个代际号：本次之后任何更晚的 start() 都会让本次作废
      const gen = ++startGen.current

      // 切歌/重试都要先把上一个未完成的请求取消掉，免得它回来抢音源
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }

      setCurrent(song)
      setError(null)
      setErrorRetryable(false)
      setNotice(null)
      setLoading(true)
      // 换了歌就重新给它机会：自动重取地址的闸门与重试计数都归零
      if (!options.isRetry) retryCount.current = 0
      retriedSongId.current = null

      const audio = audioRef.current
      if (!audio) {
        // audio 还没挂上（极少见）。若不把 loading 放掉，界面会永远转圈
        setLoading(false)
        return
      }

      /*
       * ★ 立刻停掉当前音源。
       *
       * 这一步专门消掉「界面已切到下一首、旧歌还在响」那个窗口 ——
       * 取地址要几百毫秒，期间用户看到的是新歌封面，听到的却是上一首，
       * 那正是站长反馈的现象。先停再取，「看到什么就听到什么」。
       */
      audio.pause()

      const result = await fetchUrl(song, controller.signal, options.force === true)

      // ★★ 过期请求：期间用户又切了歌，本次结果一律丢弃
      if (gen !== startGen.current) return

      if (!result.ok) {
        setLoading(false)
        setPlaying(false)
        audio.removeAttribute("src")
        await handleFailure(song, result.error, result.code)
        return
      }

      consecutiveSkips.current = 0

      // 地址失效后重试时要接回断掉的位置
      if (options.resumeAt && options.resumeAt > 0) {
        const seekTo = options.resumeAt
        const onLoaded = () => {
          if (gen !== startGen.current) return
          audio.currentTime = seekTo
        }
        audio.addEventListener("loadedmetadata", onLoaded, { once: true })
      }

      audio.src = result.url
      try {
        // 点击是用户手势，浏览器允许此时自动播放
        await audio.play()
        if (gen !== startGen.current) return
        setPlaying(true)

        /*
         * 开播成功 → 如果这一轮之前跳过了一些歌，现在**正是说明的时候**
         * （播放已经稳定，这句提示不会被后续的 setError(null) 冲掉）。
         * 跳过但不告诉用户，他会以为播放器「莫名其妙从中间开始了」。
         */
        const skipped = skippedTitles.current
        if (skipped.length > 0) {
          skippedTitles.current = []
          setNotice(
            `已跳过 ${skipped.length} 首无法播放的歌：${skipped.slice(0, 3).join("、")}${skipped.length > 3 ? "…" : ""}`
          )
        }
      } catch (err) {
        if (gen !== startGen.current) return
        /*
         * play() 失败分两种，必须区分（否则会把「用户切歌导致的 AbortError」
         * 也报成播放失败，那会误导用户以为歌坏了）：
         *  - AbortError：play() 被后续的 pause() 打断，是切歌的正常结果，静默
         *  - 其余：真的播不了
         */
        if (err instanceof DOMException && err.name === "AbortError") return
        setPlaying(false)
        await handleFailure(song, "浏览器无法播放这首歌", "url_unavailable")
        return
      } finally {
        // ★ 只有最新那次请求能改 loading，否则旧请求结束会把新请求的转圈关掉
        if (gen === startGen.current) setLoading(false)
      }

      // 成功开播 → 顺手把下一首的地址取回来（只 1 首，见 prefetched 的注释）
      void prefetchNext()
    },
    [fetchUrl, handleFailure, prefetchNext]
  )

  /**
   * 地址失效时的自动恢复：跳过缓存重取一次，并从断掉的位置接着播。
   *
   * 与 retryManually 的区别：这个有「每首只自动重试一次」的闸门 ——
   * 自动行为必须收敛，否则源站没版权时会无限重试。
   */
  const retryCurrent = useCallback(() => {
    const song = currentRef.current
    if (!song || retrying.current) return
    if (retriedSongId.current === song.id) return
    retriedSongId.current = song.id
    retrying.current = true
    const resumeAt = audioRef.current?.currentTime ?? 0
    void start(song, { force: true, resumeAt }).finally(() => {
      retrying.current = false
    })
  }, [start])

  /** 用户主动点「重试」：不受自动重试闸门限制，且重置连续跳过计数 */
  const retryManually = useCallback(() => {
    const song = currentRef.current
    if (!song) return
    retryCount.current = 0
    consecutiveSkips.current = 0
    retriedSongId.current = null
    void start(song, { force: true })
  }, [start])

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
      // 队列变了，预取的「下一首」可能已经不在新队列里
      prefetched.current = null
      void start(song)
    },
    [setQueueAndReset, start]
  )

  /**
   * 随机播放：从队列里**随机挑一首**当起点，并当场把随机顺序洗好。
   *
   * 为什么需要单独的入口：
   * 原先是 `playAll(true)` → `play(playable[0], playable)`，
   * 也就是「把模式设成随机，但仍从队列第一首开始」——
   * 于是每次都听到同一个开头，只有后面的歌是随机的。
   * 站长反馈的「随机播放第一首固定」就是这个原因。
   *
   * 为什么要把顺序**当场**洗好，而不是等第一次点「下一首」再惰性生成：
   * 1. 播放列表面板展示的顺序立刻就是真实的随机顺序，不会看着是原始顺序、
   *    点一下却跳到别处
   * 2. 随机起点与随机顺序一起确定，行为更可预期
   *
   * 起点不排除「当前正在播的那首」——站长选择的是纯粹随机。
   * 代价是连点两次「随机播放」有小概率抽到同一首（1/N）。
   */
  const playShuffled = useCallback(
    (list: PlayerSong[]) => {
      if (list.length === 0) return
      const pick = list[Math.floor(Math.random() * list.length)]

      setQueue(list)
      // 以被选中的那首为「位置 0」洗一副。（buildShuffleOrder 会把当前歌放最前，
      // 这样 step() 往后走就正好是洗过的顺序，不需要额外记下标。）
      shuffleOrder.current = buildShuffleOrder(list, pick.id)
      shuffleHistory.current = []
      prefetched.current = null
      void start(pick)
    },
    [start]
  )

  /** 只换当前曲、不动队列 —— 播放列表面板里点某一首用它 */
  const playSong = useCallback(
    (song: PlayerSong) => {
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
      const song = currentRef.current
      const list = queueRef.current
      if (!song || list.length === 0) return

      const outcome = resolveStep({
        mode: modeRef.current,
        queueIds: list.map((s) => s.id),
        currentId: song.id,
        delta,
        shuffleOrderIds: shuffleOrder.current,
        history: shuffleHistory.current,
      })
      shuffleOrder.current = outcome.shuffleOrderIds
      shuffleHistory.current = outcome.history
      if (outcome.nextId === null) return // 顺序播放到底了就停

      const nextSong = list.find((s) => s.id === outcome.nextId)
      if (!nextSong) return
      // 手动切歌：用户换了主意，连续跳过计数与旧提示都该重来
      consecutiveSkips.current = 0
      skippedTitles.current = []
      setNotice(null)
      void start(nextSong)
    },
    [start]
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
    /*
     * 关闭时要**把在飞的请求与定时器都停掉**，否则它们会在组件已经
     * 「没有当前歌」的状态下回来改 state（表现为关掉播放器后又弹一个错误）。
     */
    startGen.current += 1
    prefetchGen.current += 1
    abortRef.current?.abort()
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
    }
    retriedSongId.current = null
    retryCount.current = 0
    consecutiveSkips.current = 0
    prefetched.current = null
    shuffleOrder.current = []
    shuffleHistory.current = []
    setCurrent(null)
    setPlaying(false)
    setError(null)
    setErrorRetryable(false)
    setNotice(null)
    setLoading(false)
    setQueue([])
  }, [])

  /*
   * `current` / `queue` / `mode` 的 ref 镜像。
   *
   * 为什么需要：异步回调（失败分流、预取、重试定时器）里必须拿到**当下**的值，
   * 而闭包捕获的是它们被创建时的旧值 —— 那正是竞态的另一种形态，而且更难察觉
   * （表现为「用上一首的列表去算下一首」）。
   */
  useEffect(() => {
    currentRef.current = current
    queueRef.current = queue
    modeRef.current = mode
  }, [current, queue, mode])

  /*
   * 把 start / step 挂到 ref 上，供「失败分流 → 跳下一首」与
   * 「重试定时器 → 重新播放」这两条异步路径回调。
   *
   * ⚠️ 必须在 effect 里赋值，**不能**在渲染期写 ref：
   * 项目开了 eslint 的 react-hooks/refs，渲染期碰 `.current` 会直接报错。
   * 那也不是洁癖 —— 渲染期改 ref 在并发渲染下确实可能丢失或错乱。
   */
  useEffect(() => {
    startRef.current = start
    stepRef.current = step
  }, [start, step])

  // 卸载时清掉定时器与在飞的请求
  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      abortRef.current?.abort()
    }
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      playing,
      loading,
      error,
      errorRetryable,
      notice,
      queue,
      mode,
      setMode,
      cycleMode,
      playSong,
      audioRef,
      play,
      playShuffled,
      toggle,
      next: () => step(1),
      prev: () => step(-1),
      close,
      retryCurrent,
      retryManually,
    }),
    [
      current,
      playing,
      loading,
      error,
      errorRetryable,
      notice,
      queue,
      mode,
      setMode,
      cycleMode,
      playSong,
      play,
      playShuffled,
      toggle,
      step,
      close,
      retryCurrent,
      retryManually,
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
          if (!currentRef.current) return
          // 重取过程中 src 会被换掉，中间的 error 事件不该覆盖最终结论
          if (retrying.current) return
          if (retriedSongId.current !== currentRef.current.id) {
            retryCurrent()
            return
          }
          setError("播放地址已失效，请重新点击播放")
          setErrorRetryable(true)
          setPlaying(false)
        }}
      />
    </PlayerContext.Provider>
  )
}
