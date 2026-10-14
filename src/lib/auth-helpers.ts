import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
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

/**
 * 取当前登录用户；**会话对应的账号已被删除时返回 null**。
 *
 * ⚠️ 这里必须查库确认用户仍然存在，不能只信 JWT。
 *
 * 为什么：Auth.js 用的是 JWT 会话，**token 一旦签发就在有效期内一直有效**，
 * 服务端无法主动吊销它（除非引入撤销名单）。所以「账号被删掉」之后：
 *   - JWT 仍然是合法签名、仍在有效期内
 *   - 里面的 `id` 仍然指向一个**已经不存在的用户**
 *   - 只信 JWT 的话，被删的账号能继续登录、继续用所有需要登录的功能
 *
 * 实测过这个缺口：删掉账号后用原来的 cookie 请求，
 * `/api/auth/session` 仍返回该用户，需要登录的接口也照常放行。
 *
 * 这里多一次按主键的查库（SQLite 上微秒级），换来「删号立刻失效」。
 * 而 `session` 回调本来就已经在查库刷新角色了，所以并没有引入新的查询成本。
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth()
  const user = session?.user
  // id 是登录后必然写入的，没有它就当未登录
  if (!user?.id) return null

  const id = Number.parseInt(user.id, 10)
  if (!Number.isFinite(id)) return null

  /*
   * 只查一个字段，并让数据库回答「还在不在」。
   *
   * 顺带把最新的 role / permissions 一起取回来：
   * 它们比 JWT 里的快照更新（session 回调虽然也刷新，但它只管
   * `auth()` 返回的对象；这里再查一次能保证服务端各处拿到的是同一个当前值）。
   */
  const dbUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, permissions: true },
  })
  if (!dbUser) {
    // 账号已被删除：视为未登录
    return null
  }

  return {
    id: String(dbUser.id),
    email: dbUser.email,
    name: dbUser.name,
    // 数据库里 role 是自由字符串，这里收敛成应用层认识的两种取值：
    // 认不出来的一律按普通读者处理，符合最小权限
    role: dbUser.role === "OWNER" ? "OWNER" : "READER",
    permissions: dbUser.permissions ?? null,
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
