import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { ResetPasswordSchema } from "@/lib/validations"
import { describeFail, statusForFail, verifyCode } from "@/lib/email/verify-code"

/**
 * 忘记密码 · 第二步：用验证码重置密码。
 *
 * **校验、消费验证码、改密码三件事在同一个请求里完成** —— 这是刻意的：
 * 若拆成「先校验拿凭证、再带着凭证改密」，就多出一个「已验证凭证」的中间态，
 * 那是一个额外的攻击面（凭证怎么存、怎么过期、能不能重放），
 * 而收益为零。一次请求内做完，既简单又没有可重放的中间物。
 */

const RESET_IP_MAX = 20
const RESET_IP_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const burst = rateLimit(`reset-password:${ip}`, RESET_IP_MAX, RESET_IP_WINDOW_MS)
  if (!burst.allowed) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${burst.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }
  const { email, code, newPassword } = parsed.data

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    })

    /*
     * 账号不存在或未验证时，**返回与「验证码错误」相同的文案**。
     *
     * 不能返回「该邮箱未注册」—— 这个接口是公开的，
     * 那等于把「哪些邮箱注册过」直接告诉任何人。
     * 用统一文案后，攻击者无法区分「邮箱不存在」与「验证码不对」。
     */
    if (!user || user.emailVerifiedAt === null) {
      return NextResponse.json(
        { error: describeFail("mismatch") },
        { status: 400 }
      )
    }

    // 校验并消费验证码（consume 默认 true）
    const result = await verifyCode({ email, scene: "reset", code })
    if (!result.ok) {
      return NextResponse.json(
        { error: describeFail(result.reason) },
        { status: statusForFail(result.reason) }
      )
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    })

    /*
     * 关于「重置后是否让其它设备的会话失效」：
     *
     * Auth.js 用的是 JWT 会话，**服务端无法主动吊销已签发的 JWT** ——
     * 除非引入一张撤销名单（那需要每次请求查库，代价不小）。
     * 这里如实不做处理，而不是做一套看起来安全的假动作。
     * 详见 docs/emailAuthDevDoc.md 第 5.4 节与第 13 节（已知限制）。
     */

    return NextResponse.json({ ok: true, message: "密码已重置，请用新密码登录" })
  } catch (error) {
    console.error("[reset-password] 异常：", error)
    return NextResponse.json({ error: "重置失败，请稍后重试" }, { status: 500 })
  }
}
