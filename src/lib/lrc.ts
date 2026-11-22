/**
 * LRC 歌词解析（纯函数）。
 *
 * 注意一行可能有多个时间标签（副歌复用同一句时会写成
 * `[00:12.00][01:30.00]同一句词`），所以要展开成多条时间点。
 * `[ti:]`、`[ar:]` 这类元信息行没有时间标签，会被自然跳过。
 */

export interface LyricLine {
  time: number
  text: string
  /** 译文（可选）：外语歌的中文翻译，按时间戳与原文合并 */
  translation?: string
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLrc(raw: string | null | undefined): LyricLine[] {
  if (!raw) return []

  const lines: LyricLine[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(TIME_TAG)]
    if (tags.length === 0) continue

    const text = rawLine.replace(/\[[^\]]*\]/g, "").trim()
    if (text.length === 0) continue

    for (const tag of tags) {
      const minutes = Number(tag[1])
      const seconds = Number(tag[2])
      // 毫秒位数不定（.5 / .50 / .500），统一按千分位补齐
      const fraction = tag[3] ? Number(tag[3].padEnd(3, "0")) : 0
      lines.push({ time: minutes * 60 + seconds + fraction / 1000, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

/**
 * 把译文合并进原文歌词（按时间戳对齐，误差 0.35 秒内算同一句）。
 *
 * 为什么按时间戳而不是按行号：网易云的 tlyric 行数与原文常常不等
 * （纯音乐段落、重复段落处理不同），按行号对齐会整段错位。
 * 合并失败（译文对不上）时宁可不显示，也不要显示错位的译文。
 */
export function mergeTranslation(
  lines: LyricLine[],
  translationRaw: string | null | undefined
): LyricLine[] {
  const translated = parseLrc(translationRaw)
  if (translated.length === 0) return lines

  const TOLERANCE = 0.35
  return lines.map((line) => {
    const hit = translated.find((item) => Math.abs(item.time - line.time) <= TOLERANCE)
    return hit && hit.text !== line.text ? { ...line, translation: hit.text } : line
  })
}

/** 当前时间对应的歌词行下标（二分查找）；还没有到第一句时返回 -1 */
export function findLyricIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1

  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= currentTime) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}
