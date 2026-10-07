import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { getCoverUrl, getLyric, MUSIC_SOURCE, musicApiBudget } from "@/lib/music-api"
import { SongBindSchema } from "@/lib/validations"

/**
 * 把歌绑定到音乐接口，并在**这一刻**把封面地址与歌词抓取入库。
 *
 * 为什么绑定时就抓：前台渲染卡片墙的封面和歌词抽屉是每次访问都要用的，
 * 若改成运行期实时拉取，一个访客点几首就能吃光官方 60 次 / 5 分钟的配额。
 * 入库之后这两项是零调用，运行期只剩「取播放地址」一个接口。
 *
 * 封面或歌词抓取失败**不阻断绑定** —— 能不能播只取决于 apiId，
 * 缺个封面不应该让整首歌绑不上。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const parsed = SongBindSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数不合法" },
      { status: 400 }
    )
  }

  // 这批里被判定「源站没有原版」的歌，标记下来，免得下次自动匹配又白搜一遍
  const noMatchIds: number[] = Array.isArray(parsed.data.markNoMatch)
    ? parsed.data.markNoMatch.filter(
        (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0
      )
    : []
  if (noMatchIds.length > 0) {
    await prisma.song.updateMany({
      where: { id: { in: noMatchIds }, apiId: null },
      data: { matchStatus: "nomatch" },
    })
  }

  let bound = 0
  const failed: { songId: number; error: string }[] = []
  const warnings: { songId: number; error: string }[] = []
  /*
   * 回传真正落库的值。
   * 为什么不能只回 bound 计数：封面与歌词各自独立失败，界面若只乐观地
   * 记住「点了绑定」，就没法分辨某首歌的封面到底抓到了没有。
   */
  const loaded: { songId: number; coverUrl: string | null; lyric: boolean }[] = []

  for (const item of parsed.data.items) {
    const song = await prisma.song.findUnique({
      where: { id: item.songId },
      select: { id: true },
    })
    if (!song) {
      failed.push({ songId: item.songId, error: "歌曲不存在" })
      continue
    }

    // 封面与歌词各自独立失败，互不影响
    let coverUrl: string | null = null
    if (item.picId) {
      const cover = await getCoverUrl(item.picId)
      if (cover.ok) coverUrl = cover.data
      else warnings.push({ songId: item.songId, error: `封面：${cover.error}` })
    }

    let lyric: string | null = null
    if (item.lyricId) {
      const result = await getLyric(item.lyricId)
      if (result.ok) lyric = result.data
      else warnings.push({ songId: item.songId, error: `歌词：${result.error}` })
    }

    try {
      const updated = await prisma.song.update({
        where: { id: item.songId },
        data: {
          source: MUSIC_SOURCE,
          apiId: item.apiId,
          picId: item.picId ?? null,
          lyricId: item.lyricId ?? null,
          album: item.album ?? null,
          // 绑上了就不再是「无原版」状态
          matchStatus: null,
          // 之前抓到过就保留，避免这次失败反而把已有的清掉
          ...(coverUrl ? { coverUrl } : {}),
          ...(lyric ? { lyric } : {}),
        },
        select: { coverUrl: true, lyric: true },
      })
      loaded.push({
        songId: item.songId,
        coverUrl: updated.coverUrl,
        lyric: Boolean(updated.lyric),
      })
      bound += 1
    } catch (error) {
      console.error("Bind song error:", error)
      failed.push({ songId: item.songId, error: "写入失败" })
    }
  }

  return NextResponse.json({
    bound,
    loaded,
    failed,
    warnings,
    budget: musicApiBudget(),
  })
}
