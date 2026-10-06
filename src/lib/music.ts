/**
 * 歌单批量导入的解析器。
 *
 * 客户端（粘贴后实时预览）与服务端（导入时重新解析）共用这一份 ——
 * 两边各写一套的话，会出现「预览说没问题、导入却报错」这种最难查的不一致。
 */

export interface ParsedSongLine {
  /** 原始行，预览里用来对照 */
  raw: string
  title?: string
  artist?: string
  /** 解析失败原因；为空表示这一行可用 */
  error?: string
}

/** 与 validations.ts 里的 zod schema 保持一致（仅本模块内部使用） */
const SONG_TITLE_MAX = 100
const SONG_ARTIST_MAX = 100

/**
 * 分隔符按「从明确到宽松」排列：先认带空格的写法，再认裸连字符。
 * 刻意不认 "/"，因为歌手名里可能有（AC/DC）。
 */
const SEPARATORS = [
  "\t",
  " - ",
  " – ",
  " — ",
  " － ",
  " | ",
  " ｜ ",
  "-",
  "–",
  "—",
  "－",
  "|",
  "｜",
]

/** 行首列表标记：1. / 1、/ 1) / - / * / • / · */
const LIST_MARKER = /^\s*(?:\d+[.、)]|[-*•·])\s+/

/** 两侧成对的包围符号，从各处复制粘贴时常常带进来 */
const SURROUNDING = /^[《「『"'（(【\[]+|[》」』"'）)】\]]+$/g

function stripSurrounding(value: string): string {
  return value.replace(SURROUNDING, "").trim()
}

/**
 * 把粘贴的多行文本解析成歌单条目。
 * 每行约定为「歌名 - 歌手」；空行忽略；解析不了的行带 error 返回，由调用方展示。
 */
export function parseSongLines(input: string): ParsedSongLine[] {
  const result: ParsedSongLine[] = []

  for (const rawLine of input.split(/\r?\n/)) {
    const raw = rawLine.trim()
    if (!raw) continue

    const line = raw.replace(LIST_MARKER, "").trim()

    let splitAt = -1
    let splitLen = 0
    for (const sep of SEPARATORS) {
      const index = line.indexOf(sep)
      // index > 0：左边不能为空，否则整行会被当成歌手
      if (index > 0) {
        splitAt = index
        splitLen = sep.length
        break
      }
    }

    if (splitAt < 0) {
      result.push({ raw, error: "没找到分隔符，请用「歌名 - 歌手」" })
      continue
    }

    const title = stripSurrounding(line.slice(0, splitAt))
    const artist = stripSurrounding(line.slice(splitAt + splitLen))

    if (!title && !artist) {
      result.push({ raw, error: "歌名与歌手都为空" })
      continue
    }
    if (!title) {
      result.push({ raw, artist, error: "缺少歌名" })
      continue
    }
    if (!artist) {
      result.push({ raw, title, error: "缺少歌手" })
      continue
    }
    if (title.length > SONG_TITLE_MAX) {
      result.push({ raw, title, artist, error: `歌名超过 ${SONG_TITLE_MAX} 字` })
      continue
    }
    if (artist.length > SONG_ARTIST_MAX) {
      result.push({ raw, title, artist, error: `歌手名超过 ${SONG_ARTIST_MAX} 字` })
      continue
    }

    result.push({ raw, title, artist })
  }

  return result
}
