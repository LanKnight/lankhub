import type { Metadata } from "next"
import PasswordForm from "./PasswordForm"

export const metadata: Metadata = {
  title: "账号设置 - 管理后台",
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">账号设置</h1>
        <p className="text-sm text-gray-500 mt-1">修改站长登录密码</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">修改密码</h2>
        <PasswordForm />
      </div>
    </div>
  )
}
