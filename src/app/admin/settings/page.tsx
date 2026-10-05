import { redirect } from "next/navigation"

/**
 * 账号设置已迁到 /settings —— 那里对所有登录用户开放（原来只有站长进得来）。
 * 保留这个路由做 302，避免旧书签和后台侧栏的旧链接变成 404。
 */
export default function AdminSettingsPage() {
  redirect("/settings")
}
