import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { EmailOnlySchema } from "@/lib/validations"
import { describeFail, sendCode, statusForFail } from "@/lib/email/verify-code"

/**
 * 忘记密码 · 第一步：请求重置验证码。
 *
 * ⚠️ **无论邮箱是否存在，返回完全相同的话术**，而且账号不存在时**不发信**。
 *
 * 这是本功能里最需要防账号枚举的入口 —— 任何人拿一串邮箱来试，
 * 就能问出「哪些邮箱在本站注册过」。所以这里不能像注册那样给明确提示
 * （注册场景有明确提示的理由见 docs/emailAuthDevDoc.md 第 3.5 节的取舍说明）。
 *
 * 不发信这一点同样重要：若对不存在的邮箱也发信，攻击者可以用这个接口
 * 把任意邮箱当日志刷（收件人会在毫不知情的情况下收到本站邮件）。
 */

/** 与发码接口同一量级的突发限流（内存层） */
const FORGOT_IP_MAX = 10
const FORGOT_IP_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const burst = rateLimit(`forgot-password:${ip}`, FORGOT_IP_MAX, FORGOT_IP_WINDOW_MS)
  if (!burst.allowed) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${burst.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = EmailOnlySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请输入有效的邮箱地址" },
      { status: 400 }
    )
  }
  const { email } = parsed.data

  /** 所有「不该发信」的情况都用这一句 */
  const softMessage = "若该邮箱已注册，重置验证码已发送，请查收"

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    })

    // 账号不存在 → 不发信，但话术与成功一致
    if (!user) {
      console.log("[forgot-password] 账号不存在，不发信")
      return NextResponse.json({ message: softMessage })
    }

    /*
     * 账号未验证邮箱 → 也不发重置码。
     *
     * 理由：那种账号连登录都还不会成功（登录要求已验证），
     * 给它发重置码没有意义，反而是一条额外的发信途径。
     * 但**话术仍然一致**，否则又泄露了「这个邮箱存在但没验证」。
     */
    if (user.emailVerifiedAt === null) {
      console.log(`[forgot-password] 账号 #${user.id} 未验证邮箱，不发重置码`)
      return NextResponse.json({ message: softMessage })
    }

    const sent = await sendCode({ email, scene: "reset", ip })
    if (!sent.ok) {
      /*
       * 配额类失败要**如实返回**，否则用户永远等不到邮件却不知道为什么。
       * 这类错误不泄露账号是否存在（它取决于全站/单邮箱的计数，
       * 而这个分支只有在账号确实存在时才会走到）。
       */
      return NextResponse.json(
        { error: describeFail(sent.reason) },
        { status: statusForFail(sent.reason) }
      )
    }

    return NextResponse.json({ message: softMessage })
  } catch (error) {
    console.error("[forgot-password] 异常：", error)
    return NextResponse.json({ error: "请求失败，请稍后重试" }, { status: 500 })
  }
}
