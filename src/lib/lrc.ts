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
