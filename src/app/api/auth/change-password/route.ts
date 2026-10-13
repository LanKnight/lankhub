import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { getCurrentUser } from "@/lib/auth-helpers"
import { ChangePasswordWithCodeSchema } from "@/lib/validations"
import { describeFail, statusForFail, verifyCode } from "@/lib/email/verify-code"
import { isEmailEnabled } from "@/lib/email/sender"

/**
 * 已登录用户改密码：**旧密码 + 邮箱验证码 + 新密码**，一次请求完成。
 *
 * 为什么校验与改密必须同请求：见 reset-password 的说明 ——
 * 拆开就会多出一个可重放的「已验证凭证」中间态。
 *
 * 为什么保留「只凭旧密码」的退路（见下方 fallback）：
 * 如果邮件服务挂了或用户邮箱未验证，只凭旧密码的路径若被彻底砍掉，
 * 用户就完全无法改密码了。这与「保留密码登录」是同一个思路：
 * 单点故障不该让人彻底失去能力。
 */

const CHANGE_IP_MAX = 10
const CHANGE_IP_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const burst = rateLimit(`change-password:${ip}`, CHANGE_IP_MAX, CHANGE_IP_WINDOW_MS)
  if (!burst.allowed) {
    return NextResponse.json(
      { error: `尝试过于频繁，请 ${burst.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  /*
   * code 是**必填**的。
   *
   * 「只凭旧密码」的退路**不是**通过放宽这个 schema 实现的 ——
   * 那会让本接口的校验规则变成「有时可省」，边界立刻模糊。
   * 退路由客户端在「邮件功能不可用 / 邮箱未验证」时改调现有的
   * Server Action `changePasswordAction`（它只验旧密码），
   * 两条路径各自的规则保持清晰。
   */
  const parsed = ChangePasswordWithCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }
  const { oldPassword, code, newPassword } = parsed.data

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: Number(user.id) },
      select: { id: true, email: true, password: true, emailVerifiedAt: true },
    })
    if (!dbUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 })
    }

    // 先验旧密码：这一步不需要消耗验证码，先做能避免「码被消费了但旧密码错」
    const okOld = await bcrypt.compare(oldPassword, dbUser.password)
    if (!okOld) {
      // 旧密码错误不消耗验证码，让用户可以直接重试
      return NextResponse.json({ error: "当前密码错误" }, { status: 400 })
    }

    if (!isEmailEnabled()) {
      return NextResponse.json(
        { error: describeFail("email-disabled") },
        { status: statusForFail("email-disabled") }
      )
    }

    // 校验并消费验证码（收件人固定为当前登录用户的邮箱）
    const result = await verifyCode({
      email: dbUser.email,
      scene: "change",
      code,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: describeFail(result.reason) },
        { status: statusForFail(result.reason) }
      )
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { password: hashed },
    })

    return NextResponse.json({ ok: true, message: "密码已修改" })
  } catch (error) {
    console.error("[change-password] 异常：", error)
    return NextResponse.json({ error: "修改失败，请稍后重试" }, { status: 500 })
  }
}
