import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { SongUnbindSchema } from "@/lib/validations"

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

  // 走 schema 而不是自己手写校验：长度上限、类型都在 validations 里统一维护
  const parsed = SongUnbindSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "参数不合法" },
      { status: 400 }
    )
  }

  const all = parsed.data.all === true
  const songIds = parsed.data.songIds ?? []

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
        /*
         * 刻意**不清** matchStatus。
         * 「没有原版」是搜过之后的结论，与「有没有绑定」是两回事：
         * 清掉它会让当初判定无版权的歌（周杰伦那批）下次又被白搜一遍。
         * 想重新搜某首歌，走单首的「搜索绑定」即可（那条路径不受标记限制）。
         */
      },
    })
    return NextResponse.json({ unbound: result.count })
  } catch (error) {
    console.error("Unbind songs error:", error)
    return NextResponse.json({ error: "解绑失败" }, { status: 500 })
  }
}
