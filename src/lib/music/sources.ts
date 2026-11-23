/**
 * 音乐源的数据层清单（**纯数据，不 import 任何东西**）。
 *
 * 为什么单独一个文件而不是放进 registry.ts：
 * 这份数据要被三个"环境不同"的地方同时使用 ——
 *  - 客户端组件（后台搜索的源切换）
 *  - zod 校验（API 侧，不能拉进 provider 的网络代码）
 *  - next.config.ts 的 CSP（在 Next 配置里执行，`@/` 别名不可用，只能相对路径 import）
 * 所以它必须零依赖。
 */

export type SourceId = "netease" | "tencent"

export interface SourceInfo {
  /** 数据层的值，落在 Song.source 上 */
  id: SourceId
  label: string
  /** 这个源的本源接口（播放与歌词优先问它） */
  provider: "gd" | "tang" | "meting"
  /** 能不能在后台按关键词搜索并绑定 */
  searchable: boolean
}

export const MUSIC_SOURCES: SourceInfo[] = [
  { id: "netease", label: "网易云", provider: "gd", searchable: true },
  { id: "tencent", label: "QQ音乐", provider: "tang", searchable: true },
]

export const SOURCE_IDS: SourceId[] = MUSIC_SOURCES.map((item) => item.id)

export function sourceLabel(id: string): string {
  return MUSIC_SOURCES.find((item) => item.id === id)?.label ?? id
}

/**
 * 媒体域名白名单（CSP 用）。
 *
 * 少放行一个，对应线路在浏览器里会被 CSP 静默拦掉 —— 这类 bug 极难排查，
 * 所以它必须和 provider 的实现在同一个仓库位置、由同一份数据生成。
 */
export const MEDIA_HOSTS = {
  /** <audio src> 允许的域名 */
  media: [
    "https://*.music.126.net", // 网易云（GD 取到的直链）
    "https://api.injahow.cn", // Meting 公共实例（直接回流）
    "https://*.stream.qqmusic.qq.com", // QQ 音乐（Tang 取到的直链）
  ],
  /** 封面等图片允许的域名 */
  image: [
    "https://*.music.126.net",
    "https://y.gtimg.cn", // QQ 音乐封面
  ],
} as const

/** 免责/说明里要写清的来源，避免文案与代码不一致 */
export const SOURCE_DISCLAIMER =
  "网易云经 GD音乐台、QQ 音乐经 Tang、Meting 公共实例备用"
