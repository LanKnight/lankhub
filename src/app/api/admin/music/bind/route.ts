import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import {
  getCoverUrl,
  MUSIC_SOURCE,
  musicApiBudget,
  searchSongs,
  type ApiSong,
} from "@/lib/music-api"
import { fetchLyrics } from "@/lib/music/lyrics"
import { getQqPlayUrls } from "@/lib/music-qq"
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
  const loaded: { songId: number; coverUrl: string | null; lyric: boolean; lyricTrans: boolean }[] = []

  /*
   * 同一批里如果有多首同名同歌手的歌，只搜一次。
   * 校验每个 item 都要花 1 次搜索配额（见下面的注释），去重能省下重复的那几次。
   */
  const candidateCache = new Map<string, ApiSong[]>()

  for (const item of parsed.data.items) {
    const song = await prisma.song.findUnique({
      where: { id: item.songId },
      select: { id: true, title: true, artist: true },
    })
    if (!song) {
      failed.push({ songId: item.songId, error: "歌曲不存在" })
      continue
    }

    const isTencent = item.source === "tencent"

    /*
     * 校验提交上来的版本确实来自当前搜索结果。
     *
     * 为什么要多花这 1 次搜索配额：apiId 是客户端说了算的，而后台允许改歌名歌手。
     * 改了之后再点一个**旧的**对话框，就会把 A 歌的 apiId 写进 B 歌 ——
     * 结果是前台放出一首毫不相干的歌。这个错很难从界面上看出来。
     *
     * 反过来说，合法的入口（搜索添加、单首绑定）提交的 apiId 本来就来自
     * 刚刚那次搜索，所以在结果里一定能找到，不会误伤。
     *
     * QQ 源不走这段：它的 apiId 是 song_mid，在网易云的搜索结果里当然找不到，
     * 改用「取 QQ 详情能拿到播放地址」来验证（见下面的分支）。
     */
    if (!isTencent) {
      const cacheKey = `${song.title}\u0000${song.artist}`
      let candidates = candidateCache.get(cacheKey)
      if (!candidates) {
        const searched = await searchSongs(song.title, song.artist)
        candidates = searched.ok ? searched.data : []
        candidateCache.set(cacheKey, candidates)
      }
      if (!candidates.some((c) => c.apiId === item.apiId)) {
        failed.push({
          songId: item.songId,
          error: "这个版本已不在当前搜索结果里（可能已下架，或歌名歌手被改过），请重新搜索",
        })
        continue
      }
    }

    /*
     * 「校验 apiId 确实属于这首歌」在 QQ 源上换个做法：
     * 网易云那边是搜一遍看结果里有没有这个 id；QQ 这边直接取详情，
     * 取得到且有播放地址才算通过（顺带拿到封面）。
     */
    let qqCoverUrl: string | null = null
    if (isTencent) {
      const detail = await getQqPlayUrls(item.apiId, song.title)
      if (!detail.ok) {
        failed.push({
          songId: item.songId,
          error:
            detail.errorKind === "not_found"
              ? "QQ 音乐上找不到这首歌的播放地址"
              : `QQ 音乐接口暂时不可用：${detail.error}`,
        })
        continue
      }
      qqCoverUrl = detail.data.coverUrl
    }

    // 封面与歌词各自独立失败，互不影响
    let coverUrl: string | null = qqCoverUrl
    if (!coverUrl && item.picId) {
      const cover = await getCoverUrl(item.picId)
      if (cover.ok) coverUrl = cover.data
      else warnings.push({ songId: item.songId, error: `封面：${cover.error}` })
    }

    /*
     * 歌词统一交给 fetchLyrics：先本源（QQ 歌→Tang 的 song_lyric；网易云歌→GD 带译文），
     * 再兜底（Meting）。以前这里写了一段、刷新接口又写一段、还各自抄了遍"回网易云搜歌"，
     * 现在只有一处规则。
     *
     * 失败只记 warning：播放不该因为没有歌词而失败。
     */
    let lyric: string | null = null
    let lyricTrans: string | null = null
    let lyricSource: string | null = null

    const fetchedLyrics = await fetchLyrics(
      {
        title: song.title,
        artist: song.artist,
        apiId: item.apiId,
        source: isTencent ? "tencent" : "netease",
      },
      { lyricId: item.lyricId }
    )
    if (fetchedLyrics.ok) {
      lyric = fetchedLyrics.data.lyric
      lyricTrans = fetchedLyrics.data.translation
      lyricSource = fetchedLyrics.data.provider
    } else {
      warnings.push({ songId: item.songId, error: `歌词：${fetchedLyrics.error}` })
    }

    try {
      const updated = await prisma.song.update({
        where: { id: item.songId },
        data: {
          source: isTencent ? "tencent" : MUSIC_SOURCE,
          apiId: item.apiId,
          picId: item.picId ?? null,
          lyricId: item.lyricId ?? null,
          album: item.album ?? null,
          // 绑上了就不再是「无原版」状态
          matchStatus: null,
          // 之前抓到过就保留，避免这次失败反而把已有的清掉
          ...(coverUrl ? { coverUrl } : {}),
          ...(lyric ? { lyric } : {}),
          ...(lyricTrans ? { lyricTrans } : {}),
          ...(lyricSource ? { lyricSource } : {}),
        },
        select: { coverUrl: true, lyric: true, lyricTrans: true },
      })
      loaded.push({
        songId: item.songId,
        coverUrl: updated.coverUrl,
        lyric: Boolean(updated.lyric),
        lyricTrans: Boolean(updated.lyricTrans),
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
