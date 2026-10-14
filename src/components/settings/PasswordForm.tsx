"use client"

import { useState } from "react"
import { Loader2, Key, Mail } from "lucide-react"
import {
  changePasswordAction,
  changePasswordWithCodeAction,
} from "@/lib/auth-actions"
import CodeInput from "@/components/auth/CodeInput"
import SendCodeButton from "@/components/auth/SendCodeButton"

/** 与服务端 ChangePasswordSchema 保持一致，仅用于少一次往返 */
const PASSWORD_MIN = 6

/**
 * 修改密码（旧密码 + 邮箱验证码 + 新密码）。
 *
 * 为什么要验证码：只凭旧密码的话，任何拿到旧密码的人都能改掉密码
 * （共用电脑登录过、密码被看到过）。加上验证码等于要求
 * 「同时掌握密码与邮箱」两样东西。
 *
 * 退路：邮件服务不可用或邮箱未验证时，退回「仅旧密码」的老路径。
 * 不这么做的话，Resend 一出问题用户就彻底改不了密码了 ——
 * 与「保留密码登录」是同一个考虑。
 */
export default function PasswordForm({
  email,
  emailVerified,
  emailEnabled = true,
}: {
  email: string
  emailVerified: boolean
  /** 邮件功能是否可用（由服务端传入，避免在客户端读环境变量） */
  emailEnabled?: boolean
}) {
  const [oldPassword, setOldPassword] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  /** 是否使用「仅旧密码」的退路 */
  const [legacyMode, setLegacyMode] = useState(false)

  /*
   * 验证码路径只在「邮件可用 且 邮箱已验证」时作为默认。
   * 否则一进来就要求一个永远发不出来的验证码，用户会卡死。
   */
  const useCode = emailEnabled && emailVerified && !legacyMode

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (newPassword.length < PASSWORD_MIN) {
      setError(`新密码至少 ${PASSWORD_MIN} 位`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致")
      return
    }
    if (useCode && code.trim().length !== 6) {
      setError("请输入 6 位验证码")
      return
    }

    setLoading(true)
    try {
      const result = useCode
        ? await changePasswordWithCodeAction(oldPassword, code.trim(), newPassword)
        : await changePasswordAction(oldPassword, newPassword)

      if (!result.success) {
        setError(result.error || "修改失败")
        // 服务端说邮箱没验证 → 自动退到仅旧密码的路径，别让用户卡住
        if ((result as { needVerifyEmail?: boolean }).needVerifyEmail) {
          setLegacyMode(true)
        }
        return
      }

      setSuccess("密码修改成功！")
      setOldPassword("")
      setCode("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setError("修改失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  /** 发送改密码用的验证码（收件人由服务端固定为当前用户） */
  const sendChangeCode = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, scene: "change" }),
      })
      const data = await res.json()
      if (!res.ok) return data.error || "发送失败"
      return null
    } catch {
      return "网络错误，请稍后重试"
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          {success}
        </div>
      )}

      {!emailVerified && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          你的邮箱 <span className="font-medium">{email}</span> 还没有验证，
          暂时无法使用验证码保护。建议先验证邮箱。
        </div>
      )}
      {emailVerified && !emailEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          邮件服务当前不可用，暂时只能使用「当前密码」修改。
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
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
          placeholder="输入当前密码"
        />
      </div>

      {useCode && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">
              邮箱验证码
            </label>
            <SendCodeButton onSend={sendChangeCode} label="获取验证码" />
          </div>
          <CodeInput value={code} onChange={setCode} disabled={loading} />
          <p className="mt-2 text-xs text-gray-400">
            验证码会发送到 {email}，用于确认是本人操作。
          </p>
        </div>
      )}

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
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={PASSWORD_MIN}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
          placeholder={`输入新密码（至少 ${PASSWORD_MIN} 位）`}
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
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={PASSWORD_MIN}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
          placeholder="再次输入新密码"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : useCode ? (
            <Mail size={16} />
          ) : (
            <Key size={16} />
          )}
          {loading ? "保存中..." : "修改密码"}
        </button>

        {/* 仅在验证码路径可用时才提供切换，避免在没有退路时误导用户 */}
        {emailEnabled && emailVerified && (
          <button
            type="button"
            onClick={() => {
              setLegacyMode((v) => !v)
              setError("")
              setSuccess("")
            }}
            className="text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            {legacyMode ? "使用邮箱验证码保护" : "收不到验证码？"}
          </button>
        )}
      </div>
    </form>
  )
}
