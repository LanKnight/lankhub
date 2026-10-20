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
  if (user instanceof NextResponse) {
    /*
     * requireAuth 的 401 是**全站通用**的形状，这里就地补上 music 的 code。
     * 刻意不去改 auth-helpers.ts —— 那会给评论、后台等所有接口都塞一个
     * 音乐专用的错误码，把两处不相关的东西耦合起来。
     *
     * 播放器拿到 unauthorized 应当**停止自动跳歌**：没登录时队列里每一首
     * 都会失败，继续跳只会一路跳到上限。
     */
    return NextResponse.json({ error: "请先登录", code: "unauthorized" }, { status: 401 })
  }

  /*
   * 仍然保留按 IP 的限流，它管的是另一件事：
   * 登录校验要验 JWT、会话回调还会查一次库，所以未登录的请求也要限制频率。
   *
   * 60 次 / 分钟是**防滥用**，不是天花板。真正的天花板是第三方接口那
   * 45 次 / 5 分钟，超了会返回「配额快用完了」，见 src/lib/music-api.ts。
   */
  const ip = getClientIp(req.headers)

  /*
   * 解析 `retry` 参数的位置很关键：必须在限流之前。
   *
   * 因为要**根据它决定用哪一道闸门** —— 强制刷新会跳过服务端缓存直打第三方，
   * 消耗配额的速度完全不同（见下面的第二道限流）。
   */
  const force = new URL(req.url).searchParams.get("retry") === "1"

  const limitResult = rateLimit(`music:play:${ip}`, 60, 60 * 1000)
  if (!limitResult.allowed) {
    /*
     * `code` 是给播放器分流用的（见 music-api.ts 的 MusicErrorCode）：
     * 限流属于**暂时**失败，播放器应当退避重试，而不是把这首歌当成永久失效跳过去。
     */
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试", code: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limitResult.retryAfter) },
      }
    )
  }

  const url = new URL(req.url)
  const parsed = IdSchema.safeParse(url.searchParams.get("id"))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数不合法", code: "bad_request" },
      { status: 400 }
    )
  }
  /*
   * ★ `retry=1` 必须单独一道**更严**的限流。
   *
   * 为什么：它会**跳过服务端缓存**直接打第三方接口，而第三方配额只有
   * 45 次 / 5 分钟（见 music-api.ts）。上面那道 60 次/分钟是按「所有播放请求」
   * 算的，分不清「正常播放」和「强制刷新」——
   * 于是 1 秒内刷 45 次 `?retry=1` 就能把配额当场打光，
   * **全站接下来 5 分钟谁都听不了歌**（包括站长自己）。
   *
   * 这个放大是真实存在的：正常播放大量请求都能命中缓存、不消耗配额，
   * 而强制刷新每一次都实打实消耗一次。
   *
   * 3 次 / 5 分钟：正常用户的地址失效是偶发事件（暂停很久再继续），
   * 3 次足够；同时把最坏情况从「45 次打光配额」压到「3 次」。
   */
  if (force) {
    const retryLimit = rateLimit(`music:play:retry:${ip}`, 3, 5 * 60 * 1000)
    if (!retryLimit.allowed) {
      return NextResponse.json(
        { error: "强制刷新过于频繁，请稍后再试", code: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": String(retryLimit.retryAfter) },
        }
      )
    }
  }

  const song = await prisma.song.findUnique({
    where: { id: parsed.data },
    select: { apiId: true },
  })

  if (!song) {
    return NextResponse.json(
      { error: "歌曲不存在", code: "not_playable" },
      { status: 404 }
    )
  }

  /*
   * 还没绑定到 API 的歌返回 409。
   * 歌单已经没有外链字段了，所以这里不再附带「去别处听」的退路 ——
   * 前台对这类歌直接置灰不可点，提示「本站无此版本」。
   *
   * code 归为 not_playable（永久）：重试也不会有地址，播放器应直接换歌。
   */
  if (!song.apiId) {
    return NextResponse.json(
      { error: "本站没有这首歌的版本", code: "not_playable" },
      { status: 409 }
    )
  }

  const result = await getPlayUrl(song.apiId, { force })
  if (!result.ok) {
    /*
     * 把上游的 code 透传给播放器（它据此决定「立刻换歌」还是「退避重试」）。
     * 万一上游没给 code（旧路径），退化成 upstream_error —— 那属于「值得重试」，
     * 比误判成永久失败更安全：最多多试两次，而误判成永久会直接跳过一首能播的歌。
     */
    return NextResponse.json(
      { error: result.error, code: result.code ?? "upstream_error" },
      { status: 502 }
    )
  }

  return NextResponse.json({ url: result.data })
}
