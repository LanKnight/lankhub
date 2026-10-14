"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { signIn } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import bcrypt from "bcryptjs"
import {
  getClientIp,
  peekRateLimit,
  LOGIN_ACCOUNT_MAX,
  LOGIN_IP_MAX,
} from "@/lib/rate-limit"
import { ChangePasswordSchema, ProfileUpdateSchema, ChangePasswordByCodeSchema } from "@/lib/validations"
import { isEmailEnabled } from "@/lib/email/sender"
import { describeFail, verifyCode } from "@/lib/email/verify-code"

/**
 * Auth.js 用 AuthError 的子类表示登录失败，这里做鸭子类型判断而不是
 * `catch (error: any)` —— 后者是本文件原来唯一的 any。
 */
function isCredentialsSignin(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { type?: unknown }).type === "CredentialsSignin"
  )
}

/**
 * 从登录失败里取出 Auth.js 给的 `code`。
 *
 * ⚠️ **直接读 `error.code` 属性**，不要去解析 message。
 *
 * 实测（用诊断路由把错误对象原样打印出来）：
 * ```
 * { type: "CredentialsSignin", code: "credentials", kind: "signIn",
 *   message: "Read more at https://errors.authjs.dev#credentialssignin" }
 * ```
 * 注意 `message` 里**根本没有** `code=...`（那只是跳转 URL 里的形式）。
 * 我第一版就是去 message 里正则匹配 `code=xxx`，结果永远匹配不上、
 * 所有失败都落到兜底文案 —— 而症状是「验证码错误时提示不准确」，
 * 很容易误判成前端问题。
 *
 * `code` 是我们自己在 provider 里显式赋的值（见 auth.ts 的 credentialsError），
 * 所以能区分「邮箱未验证」与「验证码错误」。
 */
function credentialsErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : null
}

/** Prisma 的唯一约束冲突 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  )
}

export async function loginAction(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()

  // 先「只看不计数」地探一次限流状态。
  //
  // authorize 里被限流只会返回 null，到前端就变成「邮箱或密码错误」，
  // 用户根本看不出自己是被限流了。
  //
  // 这里必须用 peekRateLimit 而不是 rateLimit：后者会再加一次计数，
  // 与 authorize 里那次叠加，等于把阈值砍半。
  const ip = getClientIp(await headers())
  const checks = [
    peekRateLimit(`login:${normalizedEmail}:${ip}`, LOGIN_ACCOUNT_MAX),
    peekRateLimit(`login-ip:${ip}`, LOGIN_IP_MAX),
  ]
  const blocked = checks.find((c) => !c.allowed)
  if (blocked && !blocked.allowed) {
    return {
      success: false,
      error: `尝试过于频繁，请 ${blocked.retryAfter} 秒后再试`,
    }
  }

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (isCredentialsSignin(error)) {
      /*
       * 「邮箱未验证」要单独给一条可操作的提示，而不是混进
       * 「邮箱或密码错误」—— 后者会让用户反复试密码，
       * 而真正的问题是他没去收验证码。
       */
      if (credentialsErrorCode(error) === "email-not-verified") {
        return {
          success: false,
          error: "该邮箱尚未完成验证",
          needVerify: true,
        }
      }
      return { success: false, error: "邮箱或密码错误" }
    }
    console.error("[loginAction] error:", error)
    return { success: false, error: "登录失败，请稍后重试" }
  }
}

/**
 * 验证码登录（免密码）。
 *
 * 为什么是 Server Action 而不是 Route Handler：
 * 建立会话需要 `signIn()`，它只能在 Server Action / 认证流程里调用。
 * 做成公开的「校验通过就登录」接口，等于开放一个免密登录入口。
 *
 * 限流在 `email-code` provider 内做（与密码登录同一套强度）；
 * 这里只做一次「不计数」的预探，好在被限流时给出明确提示。
 */
export async function loginByCodeAction(email: string, code: string) {
  const normalizedEmail = email.trim().toLowerCase()

  const ip = getClientIp(await headers())
  const checks = [
    peekRateLimit(`login-code:${normalizedEmail}:${ip}`, LOGIN_ACCOUNT_MAX),
    peekRateLimit(`login-code-ip:${ip}`, LOGIN_IP_MAX),
  ]
  const blocked = checks.find((c) => !c.allowed)
  if (blocked && !blocked.allowed) {
    return {
      success: false,
      error: `尝试过于频繁，请 ${blocked.retryAfter} 秒后再试`,
    }
  }

  // 形状先挡一层：明显不是 6 位数字就不必走认证流程
  if (!/^\d{6}$/.test(code.trim())) {
    return { success: false, error: "请输入 6 位数字验证码" }
  }

  try {
    await signIn("email-code", {
      email: normalizedEmail,
      code: code.trim(),
      // ⚠️ mode 让本 provider 的错误 code 与密码登录区分开。
      // 不传的话两个 provider 都用默认 code，前端无法判断是哪种失败。
      mode: "code",
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (isCredentialsSignin(error)) {
      const code2 = credentialsErrorCode(error)
      if (code2 === "email-not-verified") {
        return {
          success: false,
          error: "该邮箱尚未完成验证",
          needVerify: true,
        }
      }
      if (code2 === "invalid-code") {
        // 与接口层保持同一句文案：不区分「过期/已用/错误」
        return { success: false, error: "验证码错误或已失效，请重新获取" }
      }
      return { success: false, error: "验证码登录失败，请重试" }
    }
    console.error("[loginByCodeAction] error:", error)
    return { success: false, error: "登录失败，请稍后重试" }
  }
}

/**
 * 修改密码 · **方式一：只凭邮箱验证码**。
 *
 * 站长明确要求这条路不再要原密码。安全上的取舍如实记在这里：
 *
 * | 攻击者手里的东西 | 方式一（只要验证码） | 方式二（只要旧密码） |
 * | :--- | :--- | :--- |
 * | 只有旧密码，拿不到邮箱 | 改不了 | **改得了** |
 * | 偷到了会话 cookie（共用电脑没退出） | **改得了**（再收个验证码即可） | 改不了 |
 *
 * 两条路是**互补**的：验证码那侧防「密码泄露」，旧密码那侧防「会话被盗」。
 * 用户可选任一条，所以单看任一条都不是全防 —— 两条都摆在那里才是。
 *
 * 校验、消费验证码、改密码**在同一个 Action 里完成** —— 不拆成
 * 「先校验拿凭证、再带凭证改密」，那样会多出一个可重放的中间态。
 */
export async function changePasswordWithCodeAction(code: string, newPassword: string) {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "请先登录" }
  }

  const parsed = ChangePasswordByCodeSchema.safeParse({ code, newPassword })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "请检查填写内容",
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { id: true, email: true, emailVerifiedAt: true },
  })
  if (!dbUser) {
    return { success: false, error: "用户不存在" }
  }

  // 邮箱未验证的账号没有验证码可发，只能走方式二
  if (dbUser.emailVerifiedAt === null) {
    return {
      success: false,
      error: "该邮箱尚未验证，请改用「用旧密码修改」",
      needLegacy: true,
    }
  }

  if (!isEmailEnabled()) {
    return {
      success: false,
      error: describeFail("email-disabled"),
      needLegacy: true,
    }
  }

  // 收件人固定为当前登录用户的邮箱，不接受客户端指定
  const result = await verifyCode({
    email: dbUser.email,
    scene: "change",
    code: parsed.data.code,
  })
  if (!result.ok) {
    return { success: false, error: describeFail(result.reason) }
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10)
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { password: hashed },
  })

  return { success: true }
}

/**
 * 修改密码 · **方式二：只凭旧密码**。
 *
 * 这条路原先只作为「邮件挂了」的隐藏退路，现在提升为一个一等选项。
 * 它存在的意义：邮件服务不可用、或账号邮箱未验证时，
 * **这是唯一能改密码的路** —— 没有它，一次 Resend 故障就能让人永远改不了密码。
 * （与「保留密码登录」是同一个思路。）
 */
export async function changePasswordAction(
  oldPassword: string,
  newPassword: string
) {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "请先登录" }
  }

  const parsed = ChangePasswordSchema.safeParse({ oldPassword, newPassword })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "请检查填写内容",
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: Number(user.id) },
  })
  if (!dbUser) {
    return { success: false, error: "用户不存在" }
  }

  const isValid = await bcrypt.compare(parsed.data.oldPassword, dbUser.password)
  if (!isValid) {
    return { success: false, error: "当前密码错误" }
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10)
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { password: hashed },
  })

  return { success: true }
}

/**
 * 更新自己的昵称与简介。
 *
 * 昵称改了不需要同步 JWT：界面上显示用户名的地方（拾章收录者、评论作者、
 * 后台账号列表）全部来自数据库查询，不走 session.name。
 */
export async function updateProfileAction(name: string, bio: string) {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "请先登录" }
  }

  const parsed = ProfileUpdateSchema.safeParse({ name, bio })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "请检查填写内容",
    }
  }
  const { name: nextName, bio: nextBio } = parsed.data
  const userId = Number(user.id)

  // 先查一次给出明确提示；并发时由数据库唯一索引兜底（见下面的 catch）
  const taken = await prisma.user.findFirst({
    where: { name: nextName, NOT: { id: userId } },
    select: { id: true },
  })
  if (taken) {
    return { success: false, error: "该昵称已被使用，请换一个" }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        bio: nextBio && nextBio.length > 0 ? nextBio : null,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "该昵称已被使用，请换一个" }
    }
    console.error("[updateProfileAction] error:", error)
    return { success: false, error: "保存失败，请稍后重试" }
  }

  // 让 /settings 重新读取最新的昵称与简介
  revalidatePath("/settings")
  return { success: true }
}
