/**
 * 可授予读者的内容权限 —— 全站唯一的一份。
 *
 * 为什么单独一个文件，而不是放在 auth-helpers.ts 里：
 * auth-helpers 导入了 `@/lib/auth`（服务端专用），**客户端组件根本引不进来**，
 * 于是 Navbar / UserManager / 后台布局 / users 接口各自抄了一份权限清单，
 * 一共 4 份；而 auth-helpers 里那份“权威定义”反而没人引用。
 * 加一个新权限要改 5 处，漏一处就是静默不一致。
 *
 * 这个文件刻意不导入任何东西，服务端与客户端都能用。
 */

export const PERMISSIONS = [
  { code: "article", label: "文章管理" },
  { code: "photo", label: "相册管理" },
  { code: "poem", label: "拾章管理" },
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]["code"]

/** 全部权限码，供接口做白名单过滤 */
export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map(
  (p) => p.code
)

/** 判断任意输入是不是已知的权限码（接口收到客户端传来的权限时用） */
export function isPermissionCode(value: unknown): value is PermissionCode {
  return (
    typeof value === "string" &&
    (PERMISSION_CODES as readonly string[]).includes(value)
  )
}

/**
 * 把 User.permissions 那串逗号分隔的文本解析成权限码数组。
 * 顺带过滤掉不认识的值 —— 库里可能残留已废弃的权限码，不能让它们继续生效。
 */
export function parsePermissionList(
  raw: string | null | undefined
): PermissionCode[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(isPermissionCode)
}

/** 是否拥有某权限（站长恒有） */
export function userHasPermission(
  user: { role: string; permissions?: string | null } | null | undefined,
  perm: PermissionCode
): boolean {
  if (!user) return false
  if (user.role === "OWNER") return true
  return parsePermissionList(user.permissions).includes(perm)
}

/**
 * 能否进入后台：站长，或拥有任一内容权限。
 * （原先这段判断在 Navbar 和后台布局里各写了一遍）
 */
export function canAccessAdmin(
  user: { role: string; permissions?: string | null } | null | undefined
): boolean {
  if (!user) return false
  if (user.role === "OWNER") return true
  return parsePermissionList(user.permissions).length > 0
}
