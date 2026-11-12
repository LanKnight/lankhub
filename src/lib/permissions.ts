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
 *
 * ⚠️⚠️ **这个数组里只能放「内容管理」类权限。** ⚠️⚠️
 *
 * 原因：`canAccessAdmin()` 的判据是「拥有**任意一个**权限码」。
 * 所以往里加一个非内容类权限（例如「允许播放音乐」「允许下载」），
 * 那个账号就会**静默地获得进入 `/admin` 的资格**。
 *
 * 这不是假设：曾经讨论过给「听歌需登录」加一个 `music` 权限码，
 * 那样一来「只能听歌」的账号就能进后台了。最后没加（听歌只要求登录即可），
 * 但这个坑还在。
 *
 * **要加非内容类权限，必须先把 `canAccessAdmin` 改成只认内容权限
 * （例如给每一项加 `contentAdmin` 标记），否则会开一个看不出来的后门。**
 */

export const PERMISSIONS = [
  { code: "article", label: "文章管理" },
  { code: "moment", label: "动态管理" },
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]["code"]

/**
 * 已废弃的权限码 → 现在对应的码。
 *
 * 为什么保留这张表而不是"直接删掉旧码":
 * 库里存的是历史数据（线上真有一个读者的 permissions 是 "photo"）。
 * 如果把旧码当非法值扔掉，`canAccessAdmin()` 会判他"没有任何权限" →
 * 他**直接进不去后台，而且界面上不会提示原因**。
 * 读的时候先映射一次，迁移脚本跑没跑都不会把人锁在门外。
 */
const LEGACY_PERMISSION_MAP: Record<string, PermissionCode> = {
  photo: "moment",
  poem: "moment",
}

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
 *
 * 两件事：
 *  1. 旧码按 LEGACY_PERMISSION_MAP 映射成新码（如 photo → moment）
 *  2. 丢弃完全不认识的值，并去重 —— 库里可能残留历史垃圾值，
 *     不能让它们继续生效（也不该因为它们把整串权限判成空）
 * （仅本模块内部使用，对外只暴露 userHasPermission / canAccessAdmin）
 */
function parsePermissionList(
  raw: string | null | undefined
): PermissionCode[] {
  if (!raw) return []
  const codes = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => LEGACY_PERMISSION_MAP[p] ?? p)
    .filter(isPermissionCode)
  return [...new Set(codes)]
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
 *
 * ⚠️ 判据是「任意一个权限码」，因此它**假定 `PERMISSIONS` 里全是内容权限**。
 * 要加非内容类权限（播放、下载……），必须先改这里，见文件顶部的大段警示。
 */
export function canAccessAdmin(
  user: { role: string; permissions?: string | null } | null | undefined
): boolean {
  if (!user) return false
  if (user.role === "OWNER") return true
  return parsePermissionList(user.permissions).length > 0
}
