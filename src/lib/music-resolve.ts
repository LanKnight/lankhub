/**
 * 兼容层：真正的实现已经搬到 `src/lib/music/`。
 *
 * 保留这个文件是为了让现有 import 不用一次性全改（少一次大 diff、少一次风险）。
 * 新代码请直接 `import { resolvePlayUrl } from "@/lib/music/resolve"`；
 * 这个壳会在 P4（清账）里删掉。
 */

export { invalidateResolved, resolvePlayUrl } from "./music/resolve"
export type { ResolvedPlayUrl } from "./music/resolve"
export type { ResolvableSongLike as ResolvableSong, ProviderId as ProviderName } from "./music/types"
