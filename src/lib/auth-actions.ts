"use server"

import { signIn } from "@/lib/auth"

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
