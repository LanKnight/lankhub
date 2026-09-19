/**
 * 从一组导航地址里挑出「最匹配」当前路径的那一个。
 *
 * 不能直接用 `pathname.startsWith(href)` 逐项判断：父路径也是导航项时，
 * 父子会同时命中（`/blog` 是 `/blog/collections` 的前缀，两项一起高亮）。
 * 这里改成取**最长匹配**，保证任何时刻只有一项高亮。
 *
 * 约定：
 * - `"/"` 只匹配根路径，否则它会成为所有路径的前缀
 * - 其余项匹配自身，或其后跟一个 `/`（避免 `/blogx` 误命中 `/blog`）
 *
 * 返回 `undefined` 表示当前路径不属于任何导航项。
 */
export function resolveActiveHref(
  pathname: string,
  hrefs: readonly string[]
): string | undefined {
  return hrefs
    .filter((href) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`)
    )
    .sort((a, b) => b.length - a.length)[0]
}
