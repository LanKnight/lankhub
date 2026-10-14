"use client"

import { useState } from "react"
import { KeyRound, Loader2, Mail } from "lucide-react"
import {
  changePasswordAction,
  changePasswordWithCodeAction,
} from "@/lib/auth-actions"
import CodeInput from "@/components/auth/CodeInput"
import SendCodeButton from "@/components/auth/SendCodeButton"

/** 与服务端 PasswordSchema 保持一致，仅用于少一次往返 */
const PASSWORD_MIN = 6

type Mode = "code" | "legacy"

/**
 * 修改密码（两种方式，用户任选）。
 *
 * | 方式 | 需要 | 不需要 |
 * | :--- | :--- | :--- |
 * | 邮箱验证码 | 验证码 | **原密码** |
 * | 旧密码 | 原密码 | **验证码** |
 *
 * 两条路是**互补**的，所以两条都要留：
 *   - 验证码那侧防「密码泄露」（别人知道你密码也没用，他收不到验证码）
 *   - 旧密码那侧防「会话被盗」（别人偷了你的 cookie，但他不知道旧密码）
 *
 * 另外方式二还是**唯一的兜底**：邮件服务不可用、或账号邮箱未验证时，
 * 只有它能把密码改掉 —— 没有它，一次 Resend 故障就能让人永远改不了密码。
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
  /*
   * 默认方式取决于客观条件，不强推：
   * 邮箱未验证或邮件不可用时方式一**根本用不了**（发不出验证码），
   * 若还把它设成默认，用户一进来就卡住。
   */
  const codeUsable = emailEnabled && emailVerified
  const [mode, setMode] = useState<Mode>(codeUsable ? "code" : "legacy")

  const [oldPassword, setOldPassword] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError("")
    setSuccess("")
  }

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
    if (mode === "code" && code.trim().length !== 6) {
      setError("请输入 6 位验证码")
      return
    }
    if (mode === "legacy" && !oldPassword) {
      setError("请输入当前密码")
      return
    }

    setLoading(true)
    try {
      const result =
        mode === "code"
          ? await changePasswordWithCodeAction(code.trim(), newPassword)
          : await changePasswordAction(oldPassword, newPassword)

      if (!result.success) {
        setError(result.error || "修改失败")
        /*
         * 服务端说邮箱没验证 / 邮件不可用 → 自动切到方式二。
         * 不能只显示一句错误：那条路走不通时用户必须有出路，
         * 否则他会以为「密码改不了」而放弃。
         */
        if ((result as { needLegacy?: boolean }).needLegacy) {
          setMode("legacy")
        }
        return
      }

      setSuccess("密码修改成功")
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

  /** 发送改密码用的验证码（收件人由服务端固定为当前登录用户） */
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

  // 输入框统一的长相，避免三处各写一遍还写歪
  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20"

  return (
    <div>
      {/* 两个标签页，与登录页的双标签同一套样式 */}
      <div className="mb-6 flex rounded-lg border border-gray-200 p-1" role="tablist">
        {(
          [
            { id: "code", label: "用邮箱验证码", disabled: !codeUsable },
            { id: "legacy", label: "用旧密码", disabled: false },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            disabled={t.disabled}
            onClick={() => switchMode(t.id)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === t.id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 说明为什么某个方式不可用，而不是让它静静地灰着 */}
      {!codeUsable && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {!emailVerified
            ? `邮箱 ${email} 还没有验证，暂时无法使用验证码保护，请用旧密码修改。`
            : "邮件服务当前不可用，暂时只能使用旧密码修改。"}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
          >
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
            {success}
          </div>
        )}

        {mode === "code" ? (
          <div>
            <div className="relative mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">邮箱验证码</label>
              <SendCodeButton onSend={sendChangeCode} label="获取验证码" />
            </div>
            <CodeInput value={code} onChange={setCode} disabled={loading} />
            <p className="mt-2 text-xs text-gray-400">
              验证码会发送到 {email}，用于确认是本人操作。这种方式不需要输入原密码。
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="oldPassword"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              当前密码
            </label>
            <input
              id="oldPassword"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className={inputClass}
              placeholder="输入当前密码"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="newPassword"
            className="mb-1.5 block text-sm font-medium text-gray-700"
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
            className={inputClass}
            placeholder={`至少 ${PASSWORD_MIN} 位`}
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-medium text-gray-700"
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
            className={inputClass}
            placeholder="再次输入新密码"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : mode === "code" ? (
            <Mail size={16} />
          ) : (
            <KeyRound size={16} />
          )}
          {loading ? "保存中..." : "修改密码"}
        </button>
      </form>
    </div>
  )
}
