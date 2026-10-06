import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: "OWNER" | "READER"
  permissions?: string | null
}

/** 可授予读者的权限码（站长 OWNER 恒有全部权限） */
export const PERMISSIONS = {
  article: "article", // 文章管理（只能操作自己创建的文章）
  photo: "photo", // 相册管理（只能操作自己上传的照片）
  poem: "poem", // 拾章管理（只能操作自己添加的诗词）
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth()
  const user = session?.user
  // id 是登录后必然写入的，没有它就当未登录
  if (!user?.id) return null

  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    // 数据库里 role 是自由字符串，这里收敛成应用层认识的两种取值：
    // 认不出来的一律按普通读者处理，符合最小权限
    role: user.role === "OWNER" ? "OWNER" : "READER",
    permissions: user.permissions ?? null,
  }
}

export async function isOwner(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === "OWNER"
}

/** 判断用户是否拥有某权限（OWNER 恒有） */
export function hasPermission(
  user: AuthUser | null,
  perm: PermissionCode
): boolean {
  if (!user) return false
  if (user.role === "OWNER") return true
  const perms = user.permissions?.split(",").map((p) => p.trim()) || []
  return perms.includes(perm)
}

export async function requireOwnerUser() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 })
  }
  return user
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

/**
 * 功能权限校验：OWNER 或拥有对应权限码的读者通过。
 * 通过时返回 user（供记录操作者），未通过返回 NextResponse。
 */
export async function requirePermission(perm: PermissionCode) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  if (!hasPermission(user, perm)) {
    return NextResponse.json({ error: "无权限访问" }, { status: 403 })
  }
  return user
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  return user
}
