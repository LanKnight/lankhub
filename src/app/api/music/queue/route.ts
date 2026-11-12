import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * 可播放歌曲列表（公开、只读）。
 *
 * 给「音乐悬浮按钮」用：用户还没开始放歌、又点了播放时，
 * 抽屉需要一个「默认放什么」的队列。
 *
 * 只返回播放必需的字段（不带歌词），并按
 * 「特别推荐 → 歌名」排序，保证每次点开的顺序稳定。
 * 只取已绑定音源（apiId 非空）的歌 —— 没绑定的点了也放不出来。
 */
export async function GET() {
  try {
    const songs = await prisma.song.findMany({
      where: { apiId: { not: null } },
      orderBy: [{ favorite: "desc" }, { artist: "asc" }, { sortOrder: "asc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        artist: true,
        album: true,
        coverUrl: true,
        favorite: true,
        apiId: true,
        lyric: true,
      },
    })

    return NextResponse.json(songs, {
      // 歌单变动不频繁，允许浏览器短暂缓存，减少往返
      headers: { "Cache-Control": "public, max-age=60" },
    })
  } catch (error) {
    console.error("Music queue error:", error)
    return NextResponse.json({ error: "获取歌单失败" }, { status: 500 })
  }
}
