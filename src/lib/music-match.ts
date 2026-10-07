/**
 * 把「我写的歌名 + 歌手」和「音乐接口搜出来的结果」对上号。
 *
 * 刻意保守：标题对不上就直接放弃，返回 null 交给人来选。
 * 理由是一旦错配，用户很难发现 —— 播放器会放出一首完全不相干的歌，
 * 而这比「没匹配上、需要手动选一次」糟糕得多。
 */

import type { ApiSong } from "@/lib/music-api"

/** 归一化：去掉空格、大小写差异，以及中英文里常见的分隔与装饰符号 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[（）()【】[\]《》「」『』"'`·、,，.。\-_/\\&+~!！?？:：;；]/g, "")
}

/** 歌手名可能有多位（接口用 " / " 连接，我自己的数据里可能是 "、" 或 "&"） */
function artistTokens(value: string): string[] {
  return value
    .split(/[/、,&]|feat\.?|ft\.?/i)
    .map((part) => normalize(part))
    .filter((part) => part.length > 0)
}

/**
 * 标题是否算对得上：完全相等，或一方包含另一方（处理「起风了」vs「起风了 (Live)」）。
 * 包含关系只在较短一方不少于 2 个字时才认，避免「爱」这种字命中一大片。
 */
function titleMatches(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na.length === 0 || nb.length === 0) return false
  if (na === nb) return true
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  return short.length >= 2 && long.includes(short)
}

/**
 * 从候选里挑最可能的一条。
 * 评分：标题完全相等 +2、歌手命中 +3（歌手权重更高，因为同名歌曲太多了）。
 * 分数为 0 或并列最高时返回 null，宁可让人来选。
 */
export function pickBestMatch(
  candidates: ApiSong[],
  title: string,
  artist: string
): ApiSong | null {
  const wantTokens = artistTokens(artist)

  const scored = candidates
    .filter((item) => titleMatches(item.title, title))
    .map((item) => {
      const haveTokens = artistTokens(item.artist)
      let score = normalize(item.title) === normalize(title) ? 2 : 0

      if (wantTokens.length > 0 && haveTokens.length > 0) {
        const exact = wantTokens.some((w) => haveTokens.includes(w))
        const loose = wantTokens.some((w) =>
          haveTokens.some((h) => h.includes(w) || w.includes(h))
        )
        if (exact) score += 3
        else if (loose) score += 1
      }

      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  // 最高分并列时无法判断，交给人来选
  if (scored.length > 1 && scored[1].score === scored[0].score) return null

  return scored[0].item
}
