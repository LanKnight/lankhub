"use server"

import { signIn } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import bcrypt from "bcryptjs"

export async function loginAction(email: string, password: string) {
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    return { success: true }
  } catch (error: any) {
    // Auth.js throws AuthError for invalid credentials
    if (error?.type === "CredentialsSignin") {
      return { success: false, error: "邮箱或密码错误" }
    }
    console.error("[loginAction] error:", error)
    return { success: false, error: "登录失败，请稍后重试" }
  }
}

export async function changePasswordAction(
  oldPassword: string,
  newPassword: string
) {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "请先登录" }
  }

  // 验证旧密码
  const dbUser = await prisma.user.findUnique({
    where: { id: parseInt(user.id) },
  })
  if (!dbUser) {
    return { success: false, error: "用户不存在" }
  }

  const isValid = await bcrypt.compare(oldPassword, dbUser.password)
  if (!isValid) {
    return { success: false, error: "旧密码错误" }
  }

  // 更新密码
  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { password: hashed },
  })

  return { success: true }
}
