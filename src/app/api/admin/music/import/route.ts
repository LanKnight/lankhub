import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { SongImportSchema } from "@/lib/validations"
import { parseSongLines } from "@/lib/music"

/** 单次写入的分批大小：整批塞进一个事务，几百首时可能超时 */
const CHUNK = 100

/**
 * 歌单批量导入。
 *
 * 解析用的是 src/lib/music.ts 里那份解析器 —— 与客户端预览完全同一套逻辑，
 * 不会出现「预览说没问题、导入却报错」。服务端仍然重新解析一遍，不信任客户端传来的结果。
 */
export async function POST(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const parsed = SongImportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }

  const lines = parseSongLines(parsed.data.text)
  const valid = lines.filter((l) => !l.error)
  const failed = lines.filter((l) => l.error)

  // 去重：库里已有的 + 本批内部的（歌名与歌手完全相同才算重复）
  const existing = await prisma.song.findMany({ select: { title: true, artist: true } })
  const seen = new Set(existing.map((s) => `${s.title}\u0000${s.artist}`))

  const toCreate: { title: string; artist: string; authorId: number }[] = []
  let skipped = 0
  for (const line of valid) {
    const key = `${line.title}\u0000${line.artist}`
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)
    toCreate.push({
      title: line.title as string,
      artist: line.artist as string,
      authorId: Number(user.id),
    })
  }

  try {
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await prisma.$transaction(
        toCreate.slice(i, i + CHUNK).map((data) => prisma.song.create({ data }))
      )
    }
  } catch (error) {
    console.error("Import songs error:", error)
    return NextResponse.json({ error: "导入失败" }, { status: 500 })
  }

  return NextResponse.json({
    created: toCreate.length,
    skipped,
    failed: failed.map((l) => ({ raw: l.raw, error: l.error })),
  })
}
