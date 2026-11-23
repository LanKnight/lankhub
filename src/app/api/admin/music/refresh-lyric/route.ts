import { NextRequest, NextResponse } from "next/server"

import { requireOwnerUser } from "@/lib/auth-helpers"
import { fetchLyrics } from "@/lib/music/lyrics"
import { prisma } from "@/lib/prisma"

/**
 * 刷新若干首歌的歌词与译文。
 *
 * 为什么需要它：歌词是「绑定那一刻」入库的，那一刻可能失败（源暂时不可用、
 * 或那首歌当时没有歌词）。播放不受影响，所以不该阻断绑定；但作者需要能补一次。
 *
 * 取词规则只有一处（src/lib/music/lyrics.ts）：先本源，再兜底。
 * 一次最多 20 首：第三方有配额，且这是后台手动触发的操作。
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
    select: { id: true, title: true, artist: true, apiId: true, source: true, lyricId: true },
  })

  let updated = 0
  const skipped: { songId: number; reason: string }[] = []

  for (const song of songs) {
    if (!song.apiId) {
      skipped.push({ songId: song.id, reason: "这首歌还没绑定音源" })
      continue
    }

    const result = await fetchLyrics(
      { title: song.title, artist: song.artist, apiId: song.apiId, source: song.source },
      { lyricId: song.lyricId }
    )
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
        lyricSource: result.data.provider,
      },
    })
    updated += 1
  }

  return NextResponse.json({ updated, skipped })
}
