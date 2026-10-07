import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { musicApiBudget, searchSongs, type ApiSong } from "@/lib/music-api"
import { matchSong } from "@/lib/music-match"

/** 回传给界面供人工挑选的候选条数。实测可信原版最靠后的一例排在第 8 位，
 *  留到 10 条既不再漏掉它，也不至于让人看一屏翻唱 */
const CANDIDATE_LIMIT = 10
/** 单次预览的歌曲数。每首歌只花 1 次搜索调用，所以可以比「绑定」批次（6）
 *  稍大一点，让界面少发几轮请求；但仍受配额闸门约束 */
const PROPOSAL_LIMIT = 10

/**
 * 批量自动匹配的**预览**：只搜索、不写入任何数据。
 *
 * 分批处理是硬性要求：每首歌消耗 1 次接口调用，而官方限流 60 次 / 5 分钟。
 * 前端按返回的 budget.remaining 循环调用，一次拿 PROPOSAL_LIMIT 首。
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
      /*
       * 跳过已经判定「源站无原版」的歌：网易云那批没有版权的歌（周杰伦等）
       * 搜一次就知道搜不到，标记之后还反复搜只是白耗 60 次 / 5 分钟的配额。
       */
      /*
       * 这里必须是显式的 OR，不能用 `{ not: "nomatch" }`：
       * 在 SQL 里 `NULL <> 'nomatch'` 的结果是 NULL、不是 true，
       * 而「没搜过」的歌 matchStatus 正是 NULL —— 用 not 会把它们
       * 全部过滤掉，未绑定的新歌一首也匹配不到。
       */
      ...(requested.length > 0
        ? // 用户显式点名的那几首一律照搜（单首「搜索绑定」的路径）
          { id: { in: requested } }
        : {
            OR: [{ matchStatus: null }, { matchStatus: { not: "nomatch" } }],
          }),
    },
    orderBy: { id: "asc" },
    take: PROPOSAL_LIMIT,
    select: { id: true, title: true, artist: true },
  })

  const proposals = []
  for (const song of songs) {
    /*
     * 关键词用「歌名 + 歌手」。
     * 实测（docs/music-plan.md 有记录）这个写法让歌名精确相同的候选更多、
     * 原版更靠前：「起风了 冯沁苑」拿到 9 条同名候选，只搜歌名只有 5 条。
     * 歌手名由 matchSong 在本地严格把关，所以这里带歌手不会放宽判定。
     */
    const result = await searchSongs(`${song.title} ${song.artist}`.trim())
    if (!result.ok) {
      proposals.push({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        matched: null,
        confidence: "none",
        candidates: [] as ApiSong[],
        titleMatches: [] as ApiSong[],
        error: result.error,
      })
      continue
    }

    const outcome = matchSong(result.data, song.title, song.artist)
    const matchedId = outcome.match?.apiId

    // 可信候选排最前，方便界面把它们和「歌名相同但歌手对不上」的分开呈现
    const candidates = matchedId
      ? [outcome.match as ApiSong, ...result.data.filter((c) => c.apiId !== matchedId)]
      : result.data

    proposals.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      matched: outcome.match,
      confidence: outcome.confidence,
      candidates: candidates.slice(0, CANDIDATE_LIMIT),
      // 歌名精确相同、但歌手对不上的条目：界面用它提示「可能是翻唱」
      titleMatches: outcome.titleMatches
        .filter((c) => c.apiId !== matchedId)
        .slice(0, CANDIDATE_LIMIT),
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
