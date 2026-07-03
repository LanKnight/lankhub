"use client"

import { useState } from "react"
import { Loader2, Key } from "lucide-react"
import { changePasswordAction } from "@/lib/auth-actions"

export default function PasswordForm() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (newPassword.length < 6) {
      setError("新密码至少 6 位")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致")
      return
    }

    setLoading(true)

    try {
      const result = await changePasswordAction(oldPassword, newPassword)

      if (!result.success) {
        setError(result.error || "修改失败")
        setLoading(false)
        return
      }

      setSuccess("密码修改成功！")
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setError("修改失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          {success}
        </div>
      )}

      <div>
        <label
          htmlFor="oldPassword"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          当前密码
        </label>
        <input
          id="oldPassword"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all text-sm"
          placeholder="输入当前密码"
        />
      </div>

      <div>
        <label
          htmlFor="newPassword"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          新密码
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all text-sm"
          placeholder="输入新密码（至少 6 位）"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          确认新密码
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all text-sm"
          placeholder="再次输入新密码"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Key size={16} />
        )}
        {loading ? "保存中..." : "修改密码"}
      </button>
    </form>
  )
}
