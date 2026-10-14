"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react"
import CodeInput from "./CodeInput"
import SendCodeButton from "./SendCodeButton"

/** 与服务端 ResetPasswordSchema 的 PasswordSchema 保持一致 */
const PASSWORD_MIN = 6

/**
 * 忘记密码（两步）。
 *
 * 第一步：输邮箱 → 服务端发重置验证码
 * 第二步：输验证码 + 新密码 → 服务端**在同一个请求里**校验并改密
 *
 * ⚠️ 第一步的提示**必须模糊**（「若该邮箱已注册…」）。
 * 这个接口是公开的，如果它明确回答「该邮箱未注册」，
 * 任何人拿一串邮箱来试就能问出哪些邮箱在本站注册过。
 * 服务端已经这么做了，前端**不能**自作聪明地加一句「该邮箱不存在」——
 * 一是前端本来就分不出来（服务端对两种情况返回完全相同的响应），
 * 二是那正是防枚举要防的。
 */
export default function ForgotPasswordForm() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "reset">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  /** 第一步：请求重置验证码 */
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "请求失败")
        return
      }
      setStep("reset")
      setInfo(data.message || "若该邮箱已注册，重置验证码已发送，请查收。")
    } catch {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  /** 第二步：验证码 + 新密码 */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (code.trim().length !== 6) {
      setError("请输入 6 位验证码")
      return
    }
    if (newPassword.length < PASSWORD_MIN) {
      setError(`新密码至少 ${PASSWORD_MIN} 位`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "重置失败")
        return
      }
      setSuccess("密码已重置，正在跳转到登录页...")
      redirectTimer.current = setTimeout(() => {
        router.push("/auth/login")
      }, 1500)
    } catch {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const resendCode = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) return data.error || "发送失败"
      return null
    } catch {
      return "网络错误，请稍后重试"
    }
  }

  // ---------- 第二步：设置新密码 ----------
  if (step === "reset") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <KeyRound size={22} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">设置新密码</h1>
          <p className="mt-2 text-sm text-gray-500">
            验证码已发送至 <span className="font-medium text-gray-700">{email}</span>
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
            >
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              {success}
            </div>
          )}
          {info && !success && (
            <p className="text-center text-xs leading-relaxed text-gray-400">{info}</p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">验证码</label>
              <SendCodeButton onSend={resendCode} label="重新发送" />
            </div>
            <CodeInput value={code} onChange={setCode} disabled={loading} autoFocus />
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
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
              placeholder={`至少 ${PASSWORD_MIN} 位`}
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

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {loading ? "重置中..." : "重置密码"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email")
              setError("")
              setInfo("")
              setCode("")
              setNewPassword("")
              setConfirmPassword("")
            }}
            className="mx-auto flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <ArrowLeft size={12} />
            换一个邮箱
          </button>
        </form>
      </div>
    )
  }

  // ---------- 第一步：填写邮箱 ----------
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <Mail size={22} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">忘记密码</h1>
        <p className="text-gray-500 mt-2">
          填写注册时使用的邮箱，我们会发送重置验证码
        </p>
      </div>

      <form onSubmit={handleRequest} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            placeholder="your@email.com"
          />
          <p className="mt-1 text-xs text-gray-400">
            邮箱未验证的账号无法重置密码，请先完成注册验证。
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
          {loading ? "发送中..." : "发送重置验证码"}
        </button>

        <p className="text-center text-sm text-gray-500">
          想起来了？{" "}
          <Link href="/auth/login" className="text-accent hover:text-accent-hover font-medium">
            返回登录
          </Link>
        </p>

        <p className="pt-1 text-center text-xs leading-relaxed text-gray-400">
          重置验证码由第三方邮件服务 Resend 发送。
        </p>
      </form>
    </div>
  )
}
