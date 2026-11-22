import { NextRequest, NextResponse } from "next/server"

import { requireOwnerUser } from "@/lib/auth-helpers"
import { getLyricWithTranslation } from "@/lib/music-api"
import { prisma } from "@/lib/prisma"

/**
 * 刷新若干首歌的歌词与译文。
 *
 * 为什么需要它：歌词是「绑定那一刻」入库的，而译文（tlyric）是后来才加的字段。
 * 存量歌曲要么没有译文、要么整首歌都没有歌词 —— 重绑一次代价太大（会重搜、可能换版本），
 * 所以单独开一个"按现有 lyricId 重新拉一遍"的口子。
 *
 * 一次最多 20 首：网易云那边有配额，而且这个操作是后台手动触发的。
 */
const MAX_BATCH = 20

export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => null)
  const songIds = Array.isArray(body?.songIds)
    ? body.songIds.filter((id: unknown): id is number => Number.isInteger(id) && (id as number) > 0)
    : []

  if (songIds.length === 0) {
    return NextResponse.json({ error: "缺少要刷新的歌曲" }, { status: 400 })
  }
  if (songIds.length > MAX_BATCH) {
    return NextResponse.json({ error: `一次最多刷新 ${MAX_BATCH} 首` }, { status: 400 })
  }

  const songs = await prisma.song.findMany({
    where: { id: { in: songIds } },
    select: { id: true, title: true, artist: true, lyricId: true },
  })

  let updated = 0
  const skipped: { songId: number; reason: string }[] = []

  for (const song of songs) {
    if (!song.lyricId) {
      skipped.push({ songId: song.id, reason: "这首歌没有歌词 id（未绑定或没有歌词）" })
      continue
    }

    const result = await getLyricWithTranslation(song.lyricId)
    if (!result.ok) {
      skipped.push({ songId: song.id, reason: result.error })
      continue
    }

    await prisma.song.update({
      where: { id: song.id },
      data: {
        lyric: result.data.lyric,
        // 译文为空就写 null：避免把上一次的旧译文留在库里
        lyricTrans: result.data.translation,
      },
    })
    updated += 1
  }

  return NextResponse.json({
    updated,
    skipped,
    hasTranslation: songs.length - skipped.length,
  })
}
