import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { SongCreateSchema } from "@/lib/validations"

/**
 * 「搜索添加」的建库动作：新建一条歌单记录。
 *
 * 为什么单独一个接口而不并进 /bind：
 * /bind 的职责是「把**已有**的歌绑到某个 apiId」，它按 songId 更新；
 * 而这里是**新建记录**。两者职责不同，串起来用也更清晰 ——
 * 界面上点「添加并绑定」时先调这里拿到 songId，再调 /bind 写入播放字段。
 *
 * 幂等：同名同歌手的歌若已存在，**直接返回那一条**（existed: true），
 * 不重复建。否则每搜一次就可能多出一条重复记录。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const parsed = SongCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }

  const { title, artist, favorite } = parsed.data

  try {
    // 去重看的是「歌名 + 歌手」的完全一致，与粘贴导入时代的口径保持一致
    const existing = await prisma.song.findFirst({
      where: { title, artist },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ songId: existing.id, existed: true })
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        favorite: favorite ?? false,
        authorId: Number(user.id),
      },
      select: { id: true },
    })

    return NextResponse.json({ songId: song.id, existed: false }, { status: 201 })
  } catch (error) {
    console.error("Add song error:", error)
    return NextResponse.json({ error: "添加失败" }, { status: 500 })
  }
}
