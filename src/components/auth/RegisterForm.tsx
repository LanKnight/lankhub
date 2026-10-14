"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { ArrowLeft, Loader2, Mail, UserPlus } from "lucide-react"
import CodeInput from "./CodeInput"
import SendCodeButton from "./SendCodeButton"

/** 与服务端一致，仅用于少一次往返 */
const PASSWORD_MIN = 6

/**
 * 注册（两步）。
 *
 * 第一步：昵称 + 邮箱 + 密码 → 服务端创建**未验证**账号并发出验证码
 * 第二步：输验证码 → 服务端写 `emailVerifiedAt`，注册完成
 *
 * 为什么是两步而不是「注册即完成」：
 * 一步式会让「用别人的邮箱注册」直接生效（那个账号当场可用）。
 * 两步式下账号虽然被创建，但**只有邮箱主人收得到验证码**，
 * 未验证的账号登不上 —— 这才真正解决了冒用问题。
 *
 * 第二步在**同一页内**切换而不是跳页：跳页会丢掉上下文，
 * 而且用户按后退键会回到一个已经提交过的表单。
 */
export default function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()

  const [step, setStep] = useState<"form" | "verify">("form")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 注册成功后登录页保留 callbackUrl（站内相对路径校验）
  const rawCallback = searchParams.get("callbackUrl") || "/"
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/"

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/")
    }
  }, [status, router])

  // 卸载时清掉跳转定时器，避免离开页面后还触发导航
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  /** 第一步：创建账号并请求验证码 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")
    setSuccess("")

    if (password.length < PASSWORD_MIN) {
      setError(`密码长度至少 ${PASSWORD_MIN} 位`)
      return
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        /*
         * 服务端在「邮箱已被已验证账号占用」时返回 409。
         * 这里要把「去登录」这条出路给出来，而不是只显示一句错误。
         */
        setError(data.error || "注册失败")
        return
      }

      setStep("verify")
      setInfo(
        data.message ||
          "验证码已发送到你的邮箱，请查收（注意垃圾邮件），输入验证码完成注册。"
      )
    } catch {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  /** 第二步：校验验证码 */
  const handleVerify = async (codeValue?: string) => {
    const finalCode = (codeValue ?? code).trim()
    if (finalCode.length !== 6) {
      setError("请输入 6 位验证码")
      return
    }
    setError("")
    setSuccess("")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: finalCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "验证失败")
        return
      }
      setSuccess("注册成功！正在跳转到登录页...")
      redirectTimer.current = setTimeout(() => {
        router.push(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      }, 1500)
    } catch {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  /** 重发验证码（第二步用） */
  const resendCode = async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), scene: "register" }),
      })
      const data = await res.json()
      if (!res.ok) return data.error || "发送失败"
      return null
    } catch {
      return "网络错误，请稍后重试"
    }
  }

  // ---------- 第二步 ----------
  if (step === "verify") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <Mail size={22} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">验证邮箱</h1>
          <p className="mt-2 text-sm text-gray-500">
            验证码已发送至 <span className="font-medium text-gray-700">{email}</span>
          </p>
        </div>

        <div className="space-y-5">
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
          {info && !success && (
            <p className="text-center text-xs leading-relaxed text-gray-400">{info}</p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">验证码</label>
              <SendCodeButton onSend={resendCode} label="重新发送" />
            </div>
            <CodeInput
              value={code}
              onChange={setCode}
              disabled={loading}
              autoFocus
              // 输满自动提交，省一次点击
              onComplete={(c) => handleVerify(c)}
            />
          </div>

          <button
            type="button"
            onClick={() => handleVerify()}
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {loading ? "验证中..." : "完成注册"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("form")
              setError("")
              setInfo("")
              setCode("")
            }}
            className="mx-auto flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <ArrowLeft size={12} />
            返回修改邮箱或昵称
          </button>
        </div>
      </div>
    )
  }

  // ---------- 第一步 ----------
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">创建账号</h1>
        <p className="text-gray-500 mt-2">注册 lankHub，加入我们的社区</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            昵称
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            placeholder="你的昵称"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            placeholder="your@email.com"
          />
          <p className="mt-1 text-xs text-gray-400">
            需要验证邮箱才能完成注册。这个邮箱只用于验证与找回密码。
          </p>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            placeholder={`至少 ${PASSWORD_MIN} 位密码`}
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            确认密码
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            placeholder="再次输入密码"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <UserPlus size={16} />
          )}
          {loading ? "发送验证码..." : "下一步：验证邮箱"}
        </button>

        <p className="text-center text-sm text-gray-500">
          已有账号？{" "}
          <Link
            href="/auth/login"
            className="text-accent hover:text-accent-hover font-medium"
          >
            立即登录
          </Link>
        </p>

        <p className="pt-1 text-center text-xs leading-relaxed text-gray-400">
          注册验证码由第三方邮件服务 Resend 发送。
          <br />
          我们只发送验证码，不会用于其它用途。
        </p>
      </form>
    </div>
  )
}
