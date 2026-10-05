"use client"

import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"

/**
 * 退出登录。全站唯一的退出入口，放在 /settings 里。
 *
 * 原先 signOut 这段完全相同的代码散在 4 个地方
 * （导航栏桌面 / 导航栏移动 / 后台侧栏桌面 / 后台侧栏移动），
 * 现在收成这一个组件，导航栏与后台侧栏都不再提供退出。
 */
export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: window.location.origin + "/" })}
      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
    >
      <LogOut size={16} />
      退出登录
    </button>
  )
}
