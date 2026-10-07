import { NextRequest, NextResponse } from "next/server"
import { requireOwnerUser } from "@/lib/auth-helpers"
import { musicApiBudget, searchSongs } from "@/lib/music-api"

/**
 * 搜索音乐（仅站长，用于后台绑定）。
 *
 * 前台刻意不开放搜索：既符合「我喜欢的音乐」的定位，
 * 也不会让公开访客无限消耗第三方接口那 60 次 / 5 分钟的配额。
 */
export async function GET(req: NextRequest) {
  const user = await requireOwnerUser()
  if (user instanceof NextResponse) return user

  const keyword = (new URL(req.url).searchParams.get("q") ?? "").trim()
  if (keyword.length === 0) {
    return NextResponse.json({ error: "请输入关键词" }, { status: 400 })
  }
  if (keyword.length > 100) {
    return NextResponse.json({ error: "关键词过长" }, { status: 400 })
  }

  const result = await searchSongs(keyword)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ songs: result.data, budget: musicApiBudget() })
}
