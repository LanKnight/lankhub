import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: "OWNER" | "READER"
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as AuthUser
}

export async function isOwner(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === "OWNER"
}

export async function requireOwner() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 })
  }
  return null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  return user
}
