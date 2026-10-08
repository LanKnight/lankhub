import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { SongUpdateSchema } from "@/lib/validations"

/** 歌单为站长专属，与 /api/admin/music 保持一致 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 })
  }

  const existing = await prisma.song.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 })
  }

  const parsed = SongUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }

  try {
    const { title, artist, favorite, sortOrder } = parsed.data
    const song = await prisma.song.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        artist: artist ?? existing.artist,
        favorite: favorite ?? existing.favorite,
        sortOrder: sortOrder ?? existing.sortOrder,
      },
    })
    return NextResponse.json(song)
  } catch (error) {
    console.error("Update song error:", error)
    return NextResponse.json({ error: "更新失败" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const id = Number.parseInt((await params).id, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 })
  }

  const existing = await prisma.song.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 })
  }

  try {
    await prisma.song.delete({ where: { id } })
    return NextResponse.json({ message: "已删除" })
  } catch (error) {
    console.error("Delete song error:", error)
    return NextResponse.json({ error: "删除失败" }, { status: 500 })
  }
}
