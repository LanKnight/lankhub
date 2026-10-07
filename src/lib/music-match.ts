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
 */

import type { ApiSong } from "@/lib/music-api"

export interface MatchOutcome {
  match: ApiSong | null
  /** high = 歌名与歌手都对得上；none = 没有可信匹配（多半是源站没版权） */
  confidence: "high" | "none"
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

export function matchSong(
  candidates: ApiSong[],
  title: string,
  artist: string
): MatchOutcome {
  const wantTitle = titleKey(title)
  const wantArtist = artistKey(artist)

  const credible = candidates.filter((item) => {
    if (titleKey(item.title) !== wantTitle) return false
    if (wantArtist.length === 0) return false
    return artistTokens(item.artist).some((token) =>
      isCredibleArtist(token, wantArtist)
    )
  })

  // 接口按相关度排序，可信候选里取第一条即可
  if (credible.length > 0) {
    return { match: credible[0], confidence: "high" }
  }
  return { match: null, confidence: "none" }
}
