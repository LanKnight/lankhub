/**
 * 把「我写的歌名 + 歌手」和「音乐接口搜出来的结果」对上号。
 *
 * 上一版有两个缺陷，直接导致了错绑，这里都改掉了：
 *
 *  1. 歌名允许「包含」匹配 → 「稻香(治愈版)」被当成了「稻香」，绑上了翻唱。
 *     现在要求歌名**精确相同**（只剥掉《》「」这类外围装饰，不动内部括号）。
 *
 *  2. 歌手归一化把标点全剥了 → 冒充原唱的「周杰伦.」和正版「周杰伦」
 *     变成同一个字符串、拿到同样的分数。现在只做去空格与小写，
 *     并要求**精确相等**，或「目标名后面直接跟括号」（「冯沁苑(买辣椒也用券)」
 *     这种合法别名），「周杰伦.」「周杰伦♚」一律不算。
 *
 * 还有一条更重要的前提：**网易云根本没有周杰伦的版权**，
 * 搜出来的全是翻唱。所以这里搜不到可信匹配时返回 null 是正确结果，
 * 不是失败 —— 界面会据此提示「本站无此版权，走外链」。
 * 详见 docs/music-plan.md。
 *
 * 3. 匹配结果不再依赖接口的相关度顺序。实测「大鱼 - 周深」的可信原版
 *    排在第 8 位，前面 7 条全是翻唱，所以这里在候选里**自己找第一条可信的**。
 *    找不到可信的但歌名对得上时返回 confidence: "low" 与 titleMatches，
 *    让界面拿给人判断 —— 代码始终不替用户拍板。
 */

import type { ApiSong } from "@/lib/music-api"

export interface MatchOutcome {
  /** 可信匹配。high 时取第一条；low / none 时恒为 null，绝不自动绑定 */
  match: ApiSong | null
  /**
   * high = 有可信候选（歌名精确 + 歌手可信）
   * low  = 没有可信候选，但有「歌名精确相同、歌手对不上」的条目
   *        （典型情况：网易云无周杰伦版权，搜出来全是翻唱冒用艺名）
   * none = 连歌名精确相同的条目都没有，多半是源站根本没收录
   */
  confidence: "high" | "low" | "none"
  /** 歌名精确相同的条目，按接口相关度排序。只在 low / none 时用于提示人工确认 */
  titleMatches: ApiSong[]
}

/** 歌名是否精确相同（只剥外围装饰）—— 与主匹配同一套规则，供界面复用 */
export function isTitleExact(candidateTitle: string, title: string): boolean {
  return titleKey(candidateTitle) === titleKey(title)
}

/** 只剥掉外围装饰，绝不动内部括号 —— 内部括号往往正是「翻唱版」的标记 */
const SURROUNDING = /^[《「『"'（(【\[]+|[》」』"'）)】\]]+$/g

function titleKey(value: string): string {
  return value.replace(SURROUNDING, "").trim().toLowerCase()
}

function artistKey(value: string): string {
  return value.trim().toLowerCase()
}

/** 候选的歌手字段可能写着多位歌手，拆开逐个比 */
function artistTokens(value: string): string[] {
  return value
    .split(/[/、,&]/)
    .map(artistKey)
    .filter((token) => token.length > 0)
}

/**
 * 候选的歌手是否可信：
 *  - 与目标完全相同；或
 *  - 目标名后面直接跟括号（合法别名，如「冯沁苑(买辣椒也用券)」）
 * 刻意不认「包含」：那正是「周杰伦.」「周杰伦♚」这类冒充号得分的地方。
 */
function isCredibleArtist(token: string, target: string): boolean {
  if (token === target) return true
  for (const open of ["(", "（"]) {
    if (token.startsWith(target + open)) return true
  }
  return false
}

/**
 * 候选这首歌的歌手是否可信 —— 公开版本，供「搜索添加」界面标注「疑似翻唱」。
 *
 * 与 matchSong 用的是同一套判定，所以界面上标的「疑似翻唱」与自动匹配
 * 会不会绑它，结论始终一致，不会出现「界面说不像翻唱、自动匹配却拒绝」。
 */
export function isCredibleArtistName(candidateArtist: string, target: string): boolean {
  const want = artistKey(target)
  if (want.length === 0) return false
  return artistTokens(candidateArtist).some((token) => isCredibleArtist(token, want))
}

export function matchSong(
  candidates: ApiSong[],
  title: string,
  artist: string
): MatchOutcome {
  const wantTitle = titleKey(title)
  const wantArtist = artistKey(artist)

  /*
   * 本地重排：不依赖接口返回的相关度顺序，自己在候选里挑第一条可信的。
   *
   * 为什么要这一步：接口的相关度排序对「原版」并不友好，实测「大鱼 - 周深」
   * 的可信原版排在第 8 位、前面 7 条全是翻唱。若直接取「第一条歌名相同的」，
   * 就会绑上翻唱；若只信接口顺序，原版也可能被候选条数截断而漏掉。
   */
  const titleMatches = candidates.filter((item) => titleKey(item.title) === wantTitle)
  const credible =
    wantArtist.length === 0
      ? []
      : titleMatches.filter((item) =>
          artistTokens(item.artist).some((token) => isCredibleArtist(token, wantArtist))
        )

  if (credible.length > 0) {
    return { match: credible[0], confidence: "high", titleMatches }
  }

  // 没有可信的，但歌名对得上：交给人在界面上判断，代码不替用户决定
  return {
    match: null,
    confidence: titleMatches.length > 0 ? "low" : "none",
    titleMatches,
  }
}
