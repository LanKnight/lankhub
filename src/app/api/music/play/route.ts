import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPlayUrl } from "@/lib/music-api"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { IdSchema } from "@/lib/validations"

/**
 * 取某首歌的播放地址 —— 前台唯一对访客开放的音乐接口。
 *
 * 为什么要有这层代理：GD音乐台的 JSON 接口没有 CORS 头，浏览器直接 fetch 会被拦。
 * 音频本身则由浏览器直连 CDN（`<audio src>` 不受同源策略约束），
 * 所以服务器不承担音频流量。
 *
 * 播放地址是短时签名，缓存策略在 src/lib/music-api.ts 里统一处理。
 */
export async function GET(req: NextRequest) {
  // 访客可能连着点很多首，做个温和的限流，避免把官方那 60 次/5 分钟的配额打光
  const ip = getClientIp(req.headers)
  const limitResult = rateLimit(`music:play:${ip}`, 30, 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      {
        status: 429,
        headers: { "Retry-After": String(limitResult.retryAfter) },
      }
    )
  }

  const parsed = IdSchema.safeParse(new URL(req.url).searchParams.get("id"))
  if (!parsed.success) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 })
  }

  const song = await prisma.song.findUnique({
    where: { id: parsed.data },
    select: { apiId: true, link: true },
  })

  if (!song) {
    return NextResponse.json({ error: "歌曲不存在" }, { status: 404 })
  }

  // 还没绑定到 API 的歌：把外链一并返回，前端可以退回到「去别处听」，
  // 而不是给用户一个放不出声音的播放器
  if (!song.apiId) {
    return NextResponse.json(
      { error: "这首歌尚未绑定在线播放", fallback: song.link },
      { status: 409 }
    )
  }

  const result = await getPlayUrl(song.apiId)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fallback: song.link },
      { status: 502 }
    )
  }

  return NextResponse.json({ url: result.data })
}
