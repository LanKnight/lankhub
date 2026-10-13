import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { SendCodeSchema } from "@/lib/validations"
import {
  describeFail,
  sendCode,
  statusForFail,
  type EmailScene,
} from "@/lib/email/verify-code"

/**
 * 发送邮箱验证码。
 *
 * 各场景的**返回策略不同**，这是刻意的（见 docs/emailAuthDevDoc.md 第 3.5 节）：
 *
 * | 场景 | 邮箱已被【已验证】账号占用 | 邮箱不存在 |
 * |---|---|---|
 * | register | 409「该邮箱已注册」 | 正常发码 |
 * | login / reset | 统一话术，**不发信** | 统一话术，**不发信** |
 * | change | 只能给当前登录用户的邮箱发 | —— |
 *
 * 为什么 register **明确报错**而 login/reset **统一话术**：
 * 「某邮箱是否已注册」在 login/reset 上是最容易被拿来探测账号的入口，
 * 所以那两处必须模糊；而注册时如果不明确告知，用户会卡在一个
 * 「提示成功但登不上」的死角里（这正是改造前的老问题）。
 * 这不是漏洞：攻击者拿不到邮件，无法完成验证，因此拿不到那个账号。
 */

/**
 * 针对发码的**入口级**限流。
 *
 * 与 verify-code.ts 里按库统计的配额**并存且用途不同**：
 *   - 这里挡的是「短时间内的突发请求」，纯内存、极快，在写库之前就拦住
 *   - 那里挡的是「一日/一月的累计量」，落库统计，跨重启有效
 * 两道都要：只有内存那道，重启后归零；只有落库那道，突发请求会先打到数据库。
 */
const SEND_IP_MAX = 20
const SEND_IP_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)

  const burst = rateLimit(`send-code:${ip}`, SEND_IP_MAX, SEND_IP_WINDOW_MS)
  if (!burst.allowed) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${burst.retryAfter} 秒后再试` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = SendCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "请检查填写内容" },
      { status: 400 }
    )
  }
  const { email, scene } = parsed.data

  try {
    // ---- change 场景：收件人固定为当前登录用户，不接受客户端指定 ----
    //
    // 否则任何人都能拿别人的邮箱发「修改密码验证码」，把别人的邮箱当日志刷。
    if (scene === "change") {
      const { getCurrentUser } = await import("@/lib/auth-helpers")
      const user = await getCurrentUser()
      if (!user) {
        return NextResponse.json({ error: "请先登录" }, { status: 401 })
      }
      if (user.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "只能给当前账号的邮箱发送验证码" }, { status: 403 })
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    })

    // ---- register：邮箱被【已验证】账号占用时明确报错 ----
    if (scene === "register" && user && user.emailVerifiedAt !== null) {
      return NextResponse.json(
        { error: "该邮箱已注册，请直接登录" },
        { status: 409 }
      )
    }

    // ---- login / reset：账号不存在时不发信，但返回与成功完全相同的话术 ----
    if ((scene === "login" || scene === "reset") && !user) {
      console.log(`[send-code] 账号不存在，不发信（scene=${scene}）`)
      return NextResponse.json({ message: genericMessage(scene) })
    }

    const result = await sendCode({ email, scene: scene as EmailScene, ip })
    if (!result.ok) {
      return NextResponse.json(
        { error: describeFail(result.reason), detail: result.detail },
        { status: statusForFail(result.reason) }
      )
    }

    // register 场景要把「下一步该干什么」说清楚
    return NextResponse.json({
      message:
        scene === "register"
          ? "验证码已发送到你的邮箱，请查收并完成验证"
          : genericMessage(scene),
    })
  } catch (error) {
    console.error("[send-code] 异常：", error)
    return NextResponse.json({ error: "发送失败，请稍后重试" }, { status: 500 })
  }
}

/**
 * 不泄露账号是否存在的统一话术。
 *
 * 「若该邮箱已注册」这个措辞是有意的 —— 它既让真实用户知道去查收邮件，
 * 又不告诉探测者这个邮箱到底在不在库里。
 */
function genericMessage(scene: EmailScene): string {
  switch (scene) {
    case "login":
      return "若该邮箱已注册，验证码已发送，请查收"
    case "reset":
      return "若该邮箱已注册，重置验证码已发送，请查收"
    case "change":
      return "验证码已发送到你的邮箱，请查收"
    case "register":
      return "验证码已发送到你的邮箱，请查收"
  }
}
