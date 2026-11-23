import { createBudget } from "./budget"
import { gdProvider } from "./providers/gd"
import { metingProvider } from "./providers/meting"
import { tangProvider } from "./providers/tang"
import type { Capability, MusicProvider, ProviderId, SourceId } from "./types"

/**
 * ★ 音乐源的**唯一真相源**。
 *
 * 以前一个源的信息散在六七个地方：编排里的顺序、后台搜索的下拉、绑定校验的枚举、
 * CSP 的域名、免责声明的文案…… 加一个源要改五六处，漏一处就是线上 bug。
 * 现在这些全部从这里派生：
 *  - 播放顺序：PLAY_ORDER
 *  - 后台搜索可选源：SEARCH_TABS
 *  - 后台绑定枚举：SOURCE_IDS（数据层）
 *  - CSP 媒体域名：MEDIA_HOSTS
 *  - 「音乐源」面板：SOURCE_LIST + 各源预算快照
 */

export const PROVIDERS: Record<ProviderId, MusicProvider> = {
  gd: gdProvider,
  tang: tangProvider,
  meting: metingProvider,
}

/** 后台/文档里展示的顺序 */
export const SOURCE_LIST: MusicProvider[] = [gdProvider, tangProvider, metingProvider]

/** 数据层音源（Song.source 的值域）与展示名 */
export const SOURCE_IDS: SourceId[] = ["netease", "tencent"]

export const SOURCE_LABELS: Record<SourceId, string> = {
  netease: "网易云",
  tencent: "QQ音乐",
}

/**
 * 播放时的尝试顺序（见下方注释：Tang 已退为备用）。歌词的顺序另见 lyrics.ts。
 */
export const PLAY_ORDER: Record<SourceId, ProviderId[]> = {
  // Tang 实测不稳（多次整段超时），站长要求它退出网易云主力链，只作备用。
  // 网易云的歌本来也不该按歌名去 QQ 碰运气（容易落到翻唱）。
  netease: ["gd", "meting"],
  // QQ 源的歌只有 Tang 能放（Meting 按网易云 id 取流，拿不到这些原版）
  tencent: ["tang"],
}

/** 后台搜索用的源（数据层视角：netease 搜 GD，tencent 搜 Tang） */
export const SEARCH_TABS: { source: SourceId; label: string; provider: ProviderId }[] = [
  { source: "netease", label: "网易云", provider: "gd" },
  { source: "tencent", label: "QQ音乐", provider: "tang" },
]

/**
 * CSP 里要放行的媒体/图片域名（next.config.ts 从这里生成）。
 * 少放行一个，对应线路在浏览器里会被 CSP 静默拦掉。
 */
export const MEDIA_HOSTS: string[] = [...new Set(SOURCE_LIST.flatMap((p) => p.mediaHosts))]

/** 每个源一个限流闸门（进程内） */
export const BUDGETS: Record<ProviderId, ReturnType<typeof createBudget>> = {
  gd: createBudget(gdProvider.budget),
  tang: createBudget(tangProvider.budget),
  meting: createBudget(metingProvider.budget),
}

/** 这个源能不能做某件事 */
export function supports(provider: MusicProvider, capability: Capability): boolean {
  return provider.capabilities.includes(capability)
}

/** 按能力筛出可用的源，顺序仍是 SOURCE_LIST 的顺序 */
export function providersWith(capability: Capability): MusicProvider[] {
  return SOURCE_LIST.filter((provider) => supports(provider, capability))
}

/** 数据层 → 该源的"本源"接口 */
export function primaryProviderOf(source: SourceId): ProviderId {
  return source === "tencent" ? "tang" : "gd"
}
