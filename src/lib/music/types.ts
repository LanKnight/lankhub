/**
 * 音乐模块的公共类型（**服务端专用**）。
 *
 * 这里只放"跨源通用"的概念，不放任何具体接口的细节 —— 具体接口在 providers/ 下。
 *
 * 两套 id 别混：
 *  - `SourceId`：**数据层**的音源，落在 `Song.source` 上（netease / tencent）
 *  - `ProviderId`：**传输层**实际调用的接口（gd / tang / meting）
 * 一首 netease 的歌，播放时可能先问 gd、失败再问 meting、最后按歌名问 tang；
 * 所以"歌属于哪个源"与"这次是谁服务的"不是一回事。
 */

/** 数据层音源（Song.source 的值域） */
export type SourceId = "netease" | "tencent"

/** 传输层接口实现 */
export type ProviderId = "gd" | "tang" | "meting"

/** 一个接口能做什么。编排层只按能力挑选，不写 `if (provider === "gd")` */
export type Capability = "search" | "playUrl" | "cover" | "lyric"

/**
 * 失败分类（与旧版 MusicErrorCode 对齐，保留原值以兼容前端分流）。
 */
export type MusicErrorCode =
  | "not_playable"
  | "url_unavailable"
  | "quota_exhausted"
  | "upstream_error"
  | "rate_limited"
  | "bad_request"
  | "unauthorized"

/** 每个码归类：permanent 直接跳歌，transient 值得退避重试 */
export const MUSIC_ERROR_KIND: Record<MusicErrorCode, "permanent" | "transient"> = {
  not_playable: "permanent",
  url_unavailable: "permanent",
  quota_exhausted: "transient",
  upstream_error: "transient",
  rate_limited: "transient",
  bad_request: "permanent",
  unauthorized: "permanent",
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: MusicErrorCode }

/** 一首歌在"接口侧"的标识：不同接口的 apiId 含义不同（曲目 id / song_mid） */
export interface Track {
  apiId: string
  title: string
  artist: string
  album?: string
  /** GD 的封面 id（其它接口没有） */
  picId?: string | null
  /** GD 的歌词 id（其它接口没有） */
  lyricId?: string | null
}

/** 一个可播放候选（还没探活） */
export interface PlayCandidate {
  url: string
  /** 音质描述，如 gd-999 / tang-sq / meting-default */
  quality: string
}

/** playUrls 的结果：候选 + 该源是否出错（区分"没有"与"坏了"） */
export interface PlayUrlsResult {
  candidates: PlayCandidate[]
  errored?: boolean
}

/** 解析播放地址时需要的歌曲字段（与 Song 表对齐，但不依赖 prisma 类型） */
export interface ResolvableSongLike {
  id: number
  title: string
  artist: string
  apiId: string
  source: string | null
}

/** 歌词 + 译文 + 谁给的 */
export interface FetchedLyrics {
  lyric: string
  translation: string | null
  provider: ProviderId
}

/** 一个接口的预算配置（只做声明，真正的闸门在 budget.ts） */
export interface BudgetConfig {
  /** 窗口内最多几次 */
  limit: number
  windowMs: number
  /** 两次调用最小间隔 */
  gapMs: number
}

/**
 * 源适配器。所有方法都是可选的：一个接口只实现它能做的那些，
 * 编排层按 `capabilities` 判断能不能问它。
 */
export interface MusicProvider {
  id: ProviderId
  /** 界面上显示的名字 */
  label: string
  capabilities: Capability[]
  budget: BudgetConfig
  /** 这个接口的媒体域名（用于生成 CSP，避免域名散落） */
  mediaHosts: string[]
  search?(keyword: string, artist?: string): Promise<ApiResult<Track[]>>
  /**
   * 返回候选（按音质从高到低）+ 这个源自己有没有出错。
   * `errored` 决定失败时算"暂时"还是"永久"，编排层据此决定播放器是否该重试。
   */
  playUrls?(track: Track): Promise<PlayUrlsResult>
  cover?(track: Track): Promise<string | null>
  lyrics?(track: Track): Promise<ApiResult<FetchedLyrics>>
}
