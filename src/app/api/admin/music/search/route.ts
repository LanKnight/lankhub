import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { musicApiBudget, searchSongs } from "@/lib/music-api"
import { isCredibleArtistName, isTitleExact } from "@/lib/music-match"

/**
 * 搜索音乐（仅站长），供后台的「搜索添加」与单首绑定使用。
 *
 * 前台刻意不开放搜索：既符合「我喜欢的音乐」的定位，
 * 也不会让公开访客无限消耗第三方接口那 60 次 / 5 分钟的配额。
 *
 * 除了搜索结果本身，还会标注每一条在**本站歌单里的现状**：
 *  - `inLibrary` 同名同歌手是否已经在了（避免重复添加）
 *  - `bound`     那一条是否就是当前已绑定的版本
 *  - `credible`  歌手是否与输入的歌手对得上（对不上就在界面上标「疑似翻唱」）
 *
 * 这三项都由一次 findMany 算出来，不额外消耗第三方配额。
 */
export async function GET(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const params = new URL(req.url).searchParams
  const keyword = (params.get("q") ?? "").trim()
  // 歌手可选。带上它时搜索词拼成「歌名 歌手」，实测原版更靠前
  const artist = (params.get("artist") ?? "").trim()

  if (keyword.length === 0) {
    return NextResponse.json({ error: "请输入关键词" }, { status: 400 })
  }
  if (keyword.length > 100 || artist.length > 100) {
    return NextResponse.json({ error: "关键词过长" }, { status: 400 })
  }

  const result = await searchSongs(keyword, artist)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // 本站歌单现状：按「歌名 + 歌手」与「已绑定的 apiId」两种口径查一次
  const library = await prisma.song.findMany({
    select: { title: true, artist: true, apiId: true },
  })
  const inLibrary = new Set(library.map((s) => `${s.title}\u0000${s.artist}`))
  const boundIds = new Set(
    library.map((s) => s.apiId).filter((id): id is string => Boolean(id))
  )

  const songs = result.data.map((item) => {
    const titleExact = isTitleExact(item.title, keyword)
    /*
     * 「可信」＝歌名精确相同 **且** 歌手对得上。
     * 两项都要，缺一不可 —— 只看歌手会把《刀马旦》（歌手写着「周杰伦 / 李玟」）
     * 判成可信，而它压根不是你要搜的那首歌；只看歌名则会把翻唱判成可信。
     * 这个标志的含义就是「能不能直接绑」，与 matchSong 会不会绑它结论一致。
     *
     * 没输歌手时无从比对，一律给 null，免得把「无法判断」显示成「疑似翻唱」。
     */
    return {
      ...item,
      credible: artist ? titleExact && isCredibleArtistName(item.artist, artist) : null,
      titleExact,
      inLibrary: inLibrary.has(`${item.title}\u0000${item.artist}`),
      bound: boundIds.has(item.apiId),
    }
  })

  return NextResponse.json({ songs, budget: musicApiBudget() })
}
