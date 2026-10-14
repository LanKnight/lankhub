"use client"

import { useState } from "react"
import { ChevronRight, Loader2, LogOut } from "lucide-react"
import { signOut } from "next-auth/react"

/**
 * 退出登录：与「个人资料」「修改密码」同款的列表入口，但**就地弹轻确认**。
 *
 * 为什么不像另外两个那样跳页：退出是即时动作、也不可撤销，
 * 多一跳页面反而绕；而加确认能避免误触 —— 它就紧挨着「修改密码」。
 *
 * 这个组件是全站**唯一**的退出入口。原先 signOut 那段完全相同的代码
 * 散在 4 个地方（导航栏桌面/移动、后台侧栏桌面/移动），
 * 后来收成一个组件，导航栏与后台侧栏都不再提供退出。
 */
export default function LogoutButton({ email }: { email?: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await signOut({ callbackUrl: window.location.origin + "/" })
    } catch {
      // 万一 signOut 抛错，别把用户永远留在「退出中」的状态
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div className="px-5 py-4">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex w-full items-center gap-4 text-left transition-opacity hover:opacity-80"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
          <LogOut size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-red-600">退出登录</span>
          <span className="mt-0.5 block truncate text-xs text-gray-400">
            需要重新登录才能评论或进入后台
          </span>
        </span>
        {/* 与上面两个入口的箭头占位对齐，否则三行的右边界不齐 */}
        <ChevronRight size={16} className="shrink-0 text-gray-300" />
      </button>

      {confirming && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50/60 p-4">
          <p className="text-sm text-gray-700">
            确定要退出登录吗{email ? `（${email}）` : ""}？
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? "退出中..." : "确定退出"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="text-sm text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-60"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
