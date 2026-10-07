import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { musicApiBudget, searchSongs, type ApiSong } from "@/lib/music-api"
import { matchSong } from "@/lib/music-match"
import { SONG_BIND_BATCH_MAX } from "@/lib/validations"

/**
 * 批量自动匹配的**预览**：只搜索、不写入任何数据。
 *
 * 分批处理（一次最多 6 首）是硬性要求：每首歌消耗 1 次接口调用，
 * 而官方限流 60 次 / 5 分钟。前端按返回的 remaining 循环调用。
 *
 * 匹配规则很严格（详见 src/lib/music-match.ts）：
 * 歌名精确相同 + 歌手可信才算匹配上。像周杰伦这种网易云没有版权的，
 * 搜出来全是翻唱，这里会诚实地返回 matched=null，界面提示走外链 ——
 * 宁可不绑，也不能绑错。
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
    // 只用歌名搜索：实测带上歌手并不会让网易云把原版排上来，
    // 反而可能因为关键词太窄而丢结果。歌手由 matchSong 在本地严格把关。
    const result = await searchSongs(song.title)
    if (!result.ok) {
      proposals.push({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        matched: null,
        candidates: [] as ApiSong[],
        error: result.error,
      })
      continue
    }

    const outcome = matchSong(result.data, song.title, song.artist)
    proposals.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      matched: outcome.match,
      confidence: outcome.confidence,
      // 只回传前 8 条候选供人工挑选；翻唱也在里面，由人判断
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
