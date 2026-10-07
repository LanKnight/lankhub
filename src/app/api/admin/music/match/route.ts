import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { musicApiBudget, searchSongs, type ApiSong } from "@/lib/music-api"
import { pickBestMatch } from "@/lib/music-match"
import { SONG_BIND_BATCH_MAX } from "@/lib/validations"

/**
 * 批量自动匹配的**预览**：只搜索、不写入。
 *
 * 分批处理（一次最多 6 首）是硬性要求：每首歌消耗 1 次接口调用，
 * 而官方限流 60 次 / 5 分钟。前端按返回的 remaining 循环调用。
 *
 * 匹配刻意保守：拿不准就 best 为 null，交给人在界面上手动选。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => null)
  const requested: number[] = Array.isArray(body?.songIds)
    ? body.songIds.filter(
        (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0
      )
    : []

  // 只处理尚未绑定的歌；带了 songIds 就优先处理这些
  const songs = await prisma.song.findMany({
    where: {
      apiId: null,
      ...(requested.length > 0 ? { id: { in: requested } } : {}),
    },
    orderBy: { id: "asc" },
    take: SONG_BIND_BATCH_MAX,
    select: { id: true, title: true, artist: true },
  })

  const proposals = []
  for (const song of songs) {
    // 只用歌名搜索：接口的匹配是按名称走的，带上歌手反而可能搜不到；
    // 歌手由 pickBestMatch 在本地参与打分，这样更准也更省调用
    const result = await searchSongs(song.title)
    if (!result.ok) {
      proposals.push({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        best: null,
        candidates: [] as ApiSong[],
        error: result.error,
      })
      continue
    }
    proposals.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      best: pickBestMatch(result.data, song.title, song.artist),
      // 只回传前 8 条候选，够人工挑选即可
      candidates: result.data.slice(0, 8),
      error: null,
    })
  }

  const remaining = await prisma.song.count({ where: { apiId: null } })

  return NextResponse.json({
    proposals,
    processed: songs.length,
    remaining: Math.max(0, remaining - songs.length),
    budget: musicApiBudget(),
  })
}
