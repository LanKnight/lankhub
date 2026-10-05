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
import { ChangePasswordSchema, ProfileUpdateSchema } from "@/lib/validations"

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
      return { success: false, error: "邮箱或密码错误" }
    }
    console.error("[loginAction] error:", error)
    return { success: false, error: "登录失败，请稍后重试" }
  }
}

/**
 * 修改自己的密码。所有登录用户都能调用
 * （原先只有站长能从 /admin/settings 进，普通读者连入口都没有）。
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
