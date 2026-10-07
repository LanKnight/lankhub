import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { IdSchema } from "@/lib/validations"

/**
 * 解绑：清掉在线播放相关的字段，让这首歌回到「未绑定」。
 *
 * 两种用法：
 *  - { songIds: [1,2] }  解绑指定的几首
 *  - { all: true }       清除全部绑定（一键回到干净状态）
 *
 * 会一并清掉封面地址、歌词与匹配结论 —— 换绑到别的版本时这些都得重新抓。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => null)
  const all = body?.all === true

  const songIds: number[] = Array.isArray(body?.songIds)
    ? body.songIds
        .map((n: unknown) => IdSchema.safeParse(n))
        .filter((r: { success: boolean }) => r.success)
        .map((r: { data: number }) => r.data)
    : []

  if (!all && songIds.length === 0) {
    return NextResponse.json({ error: "没有指定要解绑的歌曲" }, { status: 400 })
  }

  try {
    const result = await prisma.song.updateMany({
      where: all ? {} : { id: { in: songIds } },
      data: {
        apiId: null,
        picId: null,
        lyricId: null,
        coverUrl: null,
        lyric: null,
        album: null,
        matchStatus: null,
      },
    })
    return NextResponse.json({ unbound: result.count })
  } catch (error) {
    console.error("Unbind songs error:", error)
    return NextResponse.json({ error: "解绑失败" }, { status: 500 })
  }
}
