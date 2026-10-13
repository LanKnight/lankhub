import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { EmailSchema, VerifyCodeSchema } from "@/lib/validations"
import { describeFail, statusForFail, verifyCode } from "@/lib/email/verify-code"

/**
 * 邮箱验证接口 —— **只服务于注册的第二步**。
 *
 * 为什么只做这一件事：
 *
 * - **验证码登录**不在这里。建立会话需要 Auth.js 的 signIn()，而它只能在
 *   Server Action 里走认证流程（阶段 6）。把它做成「校验通过就登录」的公开接口，
 *   等于开放了一个免密登录入口。
 * - **改密码**也不在这里。改密的验证与消费**必须在同一个请求里完成** ——
 *   如果先用本接口把码消费掉，紧接着的改密请求就没有码可用了（除非引入
 *   一个「已验证凭证」的中间态，那是纯增加的攻击面）。
 *   所以改密在自己的接口里一次性做完校验 + 改密。
 * - **忘记密码**同理，在自己的接口里一次性做完。
 *
 * 于是本接口的语义非常干净：**校验通过 ⇒ 这个邮箱是本人 ⇒ 标记账号已验证**。
 */

/** 校验接口比发码更容易被暴力尝试，单独再限一道 */
const VERIFY_IP_MAX = 30
const VERIFY_IP_WINDOW_MS = 10 * 60 * 1000

const BodySchema = z.object({
  email: EmailSchema,
  code: VerifyCodeSchema,
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const burst = rateLimit(`verify-email:${ip}`, VERIFY_IP_MAX, VERIFY_IP_WINDOW_MS)
  if (!burst.allowed) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${burst.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }
  const { email, code } = parsed.data

  try {
    // 先确认账号存在，再校验码 —— 顺序反过来的话，一个不存在的邮箱
    // 会在库里留下一条「已消费」的验证码记录，白占清理成本
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    })
    if (!user) {
      return NextResponse.json(
        { error: "账号不存在或已被清理，请重新注册" },
        { status: 404 }
      )
    }

    // 已经验证过：直接当成功（幂等）。用户重复提交不该报错
    if (user.emailVerifiedAt !== null) {
      return NextResponse.json({ ok: true, message: "邮箱已验证，请登录" })
    }

    const result = await verifyCode({ email, scene: "register", code })
    if (!result.ok) {
      return NextResponse.json(
        { error: describeFail(result.reason) },
        { status: statusForFail(result.reason) }
      )
    }

    /*
     * 标记为已验证。
     *
     * 用 updateMany + `emailVerifiedAt: null` 条件而不是 update：
     * 并发重复提交时只有一次能写进去，避免两个请求各写一个时间戳。
     * count 为 0 说明有另一个请求刚写好了 —— 那正是我们想要的结果，不报错。
     */
    await prisma.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    })

    return NextResponse.json({ ok: true, message: "邮箱验证成功，请登录" })
  } catch (error) {
    console.error("[verify-email] 异常：", error)
    return NextResponse.json({ error: "验证失败，请稍后重试" }, { status: 500 })
  }
}
