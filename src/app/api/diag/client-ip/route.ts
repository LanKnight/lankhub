import { NextRequest, NextResponse } from "next/server"
import { getClientIp, rateLimit } from "@/lib/rate-limit"

/**
 * 客户端 IP 诊断接口（只读）。
 *
 * ## 为什么这个接口值得长期保留
 *
 * 限流是否真的生效，**完全取决于 `getClientIp()` 取到了什么** ——
 * 而这一点从外部看不出来：伪造 `X-Forwarded-For` 时，请求照样返回 200，
 * 你无法从响应判断「是限流没生效」还是「这个请求本来就该放行」。
 *
 * 实际踩过的坑：改完 Nginx 后测限流，前 21 次全 200、第二轮又零散出现 429，
 * 两种结果互相矛盾。根因是**客户端 curl 走了代理**，Nginx 看到的
 * `$remote_addr` 每次不同，于是每次都开一个新的限流桶。
 * 那种情况下无论怎么调 Nginx 都测不出结论 —— 只有让服务端自己回答
 * 「我认到了哪个 IP」才能定位。
 *
 * ## 安全性
 *
 * - **只回显与请求者自己 IP 相关的三个头**，不含 cookie、认证、其它任何信息
 * - 回显的就是调用者自己的 IP，不泄露他人的数据
 * - 加了限流，避免被当作免费的计算资源刷
 * - 它暴露的「服务端怎么解析代理想」不算秘密：这个项目是开源的，
 *   而且攻击者本来就能通过观察限流行为推断出同一件事
 *
 * ## 用法
 *
 * ```bash
 * # 连跑 5 次，看 clientIp 是否稳定
 * for i in $(seq 5); do curl -s https://站点/api/diag/client-ip; echo; done
 *
 * # 确认伪造头不再生效（期望 clientIp 是真实 IP，不是 1.2.3.4）
 * curl -s -H "X-Forwarded-For: 1.2.3.4" https://站点/api/diag/client-ip
 * ```
 */
export async function GET(req: NextRequest) {
  /*
   * 用**自己的真实 IP** 做限流键（而不是可能被伪造的那个）——
   * 否则这个诊断接口自己就成了一个「换头即无限刷」的入口。
   */
  const ip = getClientIp(req.headers)
  const limit = rateLimit(`diag:client-ip:${ip}`, 30, 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${limit.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  return NextResponse.json({
    /** 应用真正用于限流的那个值 */
    clientIp: ip,
    /** 原始头。只挑 IP 相关的三个，刻意不回显其它头 */
    raw: {
      "x-forwarded-for": req.headers.get("x-forwarded-for"),
      "x-real-ip": req.headers.get("x-real-ip"),
      forwarded: req.headers.get("forwarded"),
    },
    /** 排查时代理层数很关键：当前假设的层数见 src/lib/rate-limit.ts */
    note:
      ip === "127.0.0.1"
        ? "拿不到真实 IP（回退成 127.0.0.1）。若这是生产环境，检查 Nginx 的 X-Forwarded-For / X-Real-IP"
        : "以上 clientIp 就是限流用的键",
  })
}
