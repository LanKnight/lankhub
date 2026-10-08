import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUser, requireOwnerUser } from "@/lib/auth-helpers"
import { SongCreateSchema } from "@/lib/validations"

/**
 * 歌单是站长私人的收藏，因此只有站长能管理
 * （后台侧栏里「歌单管理」的 perm 为 null，对非站长隐藏；接口这里再独立判一次）。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  try {
    const parsed = SongCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }

    const { title, artist, favorite, sortOrder } = parsed.data
    const song = await prisma.song.create({
      data: {
        title,
        artist,
        favorite: favorite ?? false,
        sortOrder: sortOrder ?? 0,
        authorId: Number(user.id),
      },
    })

    return NextResponse.json(song, { status: 201 })
  } catch (error) {
    console.error("Create song error:", error)
    return NextResponse.json({ error: "创建失败" }, { status: 500 })
  }
}

/** 列表：管理页首屏由服务端渲染，这里供客户端刷新用 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 })
  }

  const songs = await prisma.song.findMany({
    orderBy: [{ artist: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(songs)
}
