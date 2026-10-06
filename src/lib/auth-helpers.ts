import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import {
  type PermissionCode,
  userHasPermission,
} from "@/lib/permissions"

export type AuthUser = {
  id: string
  email: string
  name: string
  role: "OWNER" | "READER"
  permissions?: string | null
}

/*
 * 权限码的唯一真相源在 src/lib/permissions.ts。
 *
 * 之所以单独一个文件：那个模块不导入任何服务端东西，客户端组件（Navbar、
 * UserManager、AdminSidebar）才能引用；而本文件导入了 @/lib/auth，客户端引不进来 ——
 * 原先就是因此导致权限清单被抄成了 4 份。
 * 这里转发一下，方便服务端代码少写一个 import。
 */
export { PERMISSIONS, PERMISSION_CODES, canAccessAdmin } from "@/lib/permissions"
export type { PermissionCode } from "@/lib/permissions"

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

/** 判断用户是否拥有某权限（OWNER 恒有）。实现见 src/lib/permissions.ts */
export function hasPermission(
  user: AuthUser | null,
  perm: PermissionCode
): boolean {
  return userHasPermission(user, perm)
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
