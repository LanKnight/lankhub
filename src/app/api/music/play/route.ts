import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { getPlayUrl } from "@/lib/music-api"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { IdSchema } from "@/lib/validations"

/**
 * 取某首歌的播放地址 —— 前台唯一的音乐接口。
 *
 * 为什么要有这层代理：GD音乐台的 JSON 接口没有 CORS 头，浏览器直接 fetch 会被拦。
 * 音频本身则由浏览器直连 CDN（`<audio src>` 不受同源策略约束），
 * 所以服务器不承担音频流量。
 *
 * 播放地址是短时签名，缓存策略在 src/lib/music-api.ts 里统一处理。
 */
export async function GET(req: NextRequest) {
  /*
   * 要求登录，并且放在**限流与查库之前**。
   *
   * 这样未登录的请求不会：消耗第三方配额、查数据库、占用限流桶。
   * 收益很实在 —— 没有这道门时，任何人刷这个接口都会真的去打第三方接口
   * （每次还可能拿回一个可用的签名地址）。
   *
   * 用 401 而不是 403：前端可据此区分「你该登录」与「你没权限」。
   */
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  /*
   * 仍然保留按 IP 的限流，它管的是另一件事：
   * 登录校验要验 JWT、会话回调还会查一次库，所以未登录的请求也要限制频率。
   *
   * 60 次 / 分钟是**防滥用**，不是天花板。真正的天花板是第三方接口那
   * 45 次 / 5 分钟，超了会返回「配额快用完了」，见 src/lib/music-api.ts。
   */
  const ip = getClientIp(req.headers)
  const limitResult = rateLimit(`music:play:${ip}`, 60, 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      {
        status: 429,
        headers: { "Retry-After": String(limitResult.retryAfter) },
      }
    )
  }

  const url = new URL(req.url)
  const parsed = IdSchema.safeParse(url.searchParams.get("id"))
  if (!parsed.success) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 })
  }
  // 播放器播到一半发现地址失效时会带这个参数回来，跳过内存缓存重取一次，
  // 否则重试拿到的还是那条已经坏掉的地址
  const force = url.searchParams.get("retry") === "1"

  const song = await prisma.song.findUnique({
    where: { id: parsed.data },
    select: { apiId: true },
  })

  if (!song) {
    return NextResponse.json({ error: "歌曲不存在" }, { status: 404 })
  }

  /*
   * 还没绑定到 API 的歌返回 409。
   * 歌单已经没有外链字段了，所以这里不再附带「去别处听」的退路 ——
   * 前台对这类歌直接置灰不可点，提示「本站无此版本」。
   */
  if (!song.apiId) {
    return NextResponse.json({ error: "本站没有这首歌的版本" }, { status: 409 })
  }

  const result = await getPlayUrl(song.apiId, { force })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ url: result.data })
}
