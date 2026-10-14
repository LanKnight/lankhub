"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, LogIn, Mail } from "lucide-react"
import { loginAction, loginByCodeAction } from "@/lib/auth-actions"
import CodeInput from "./CodeInput"
import SendCodeButton from "./SendCodeButton"

type Tab = "password" | "code"

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()

  const [tab, setTab] = useState<Tab>("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  /** 服务端说这个邮箱没验证时置位：给用户一个明确的下一步 */
  const [needVerify, setNeedVerify] = useState(false)

  // 校验 callbackUrl，防止开放重定向（仅允许站内相对路径）
  const rawCallback = searchParams.get("callbackUrl") || "/"
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/"

  // 已登录用户访问登录页：直接跳回目标页
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl)
    }
  }, [status, callbackUrl, router])

  /** 切换标签页时清掉上一页的错误，避免「验证码页显示密码错误」这种错位 */
  function switchTab(next: Tab) {
    if (next === tab) return
    setTab(next)
    setError("")
    setNeedVerify(false)
    setCode("")
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setNeedVerify(false)
    setLoading(true)
    try {
      const result = await loginAction(email.trim(), password)
      if (!result.success) {
        setError(result.error || "邮箱或密码错误")
        if (result.needVerify) setNeedVerify(true)
        return
      }
      // 硬导航确保 session cookie 被所有组件正确加载
      window.location.href = callbackUrl
    } catch {
      setError("登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const handleCodeLogin = async (codeValue?: string) => {
    const finalCode = (codeValue ?? code).trim()
    if (finalCode.length !== 6) {
      setError("请输入 6 位验证码")
      return
    }
    setError("")
    setNeedVerify(false)
    setLoading(true)
    try {
      const result = await loginByCodeAction(email.trim(), finalCode)
      if (!result.success) {
        setError(result.error || "验证码登录失败")
        if (result.needVerify) setNeedVerify(true)
        return
      }
      window.location.href = callbackUrl
    } catch {
      setError("登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  /** 发验证码：返回 null 表示成功，字符串表示要显示的错误 */
  const sendLoginCode = async (): Promise<string | null> => {
    if (!email.trim()) return "请先填写邮箱"
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), scene: "login" }),
      })
      const data = await res.json()
      if (!res.ok) return data.error || "发送失败"
      /*
       * 注意：服务端对「邮箱不存在」也返回成功（防账号枚举）。
       * 所以这里**不能**提示「该邮箱未注册」——我们自己也分不出来，
       * 而且那正是防枚举要的效果。统一提示「若已注册请查收」。
       */
      return null
    } catch {
      return "网络错误，请稍后重试"
    }
  }

  const isPasswordTab = tab === "password"

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">欢迎回来</h1>
        <p className="text-gray-500 mt-2">登录你的 lankHub 账号</p>
      </div>

      {/* 两个标签页。默认「密码登录」—— 既有用户习惯它，且 Resend 出问题时它仍可用 */}
      <div className="mb-6 flex rounded-lg border border-gray-200 p-1" role="tablist">
        {(
          [
            { id: "password", label: "密码登录" },
            { id: "code", label: "验证码登录" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={
          isPasswordTab
            ? handlePasswordLogin
            : (e) => {
                e.preventDefault()
                handleCodeLogin()
              }
        }
        className="space-y-5"
      >
        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm"
          >
            {error}
          </div>
        )}

        {needVerify && (
          /*
           * 「密码对但邮箱没验证」需要一条**可操作**的提示：
           * 告诉用户去哪一步解决，而不是让他反复试密码。
           */
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            <p>这个邮箱还没有完成验证，请先验证邮箱后再登录。</p>
            <button
              type="button"
              onClick={() => {
                setTab("code")
                setError("")
                setNeedVerify(false)
              }}
              className="mt-2 font-medium underline hover:no-underline"
            >
              去验证邮箱 →
            </button>
          </div>
        )}

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
        </div>

        {isPasswordTab ? (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密码
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-gray-400 transition-colors hover:text-accent"
              >
                忘记密码？
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
              placeholder="••••••••"
            />
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-gray-700">验证码</label>
              <SendCodeButton onSend={sendLoginCode} disabled={!email.trim()} />
            </div>
            <CodeInput
              value={code}
              onChange={setCode}
              disabled={loading}
              // 输满自动提交，省一次点击
              onComplete={(c) => handleCodeLogin(c)}
            />
            <p className="mt-2 text-xs text-gray-400">
              没有收到？请检查垃圾邮件，或确认邮箱是否已经注册过。
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isPasswordTab ? (
            <LogIn size={16} />
          ) : (
            <Mail size={16} />
          )}
          {loading ? "登录中..." : "登录"}
        </button>

        <p className="text-center text-sm text-gray-500">
          还没有账号？{" "}
          <Link
            href="/auth/register"
            className="text-accent hover:text-accent-hover font-medium"
          >
            立即注册
          </Link>
        </p>

        {/*
          第三方服务说明。站长要求：登录处要写明用到了别人的服务。
          小字、不抢眼，但必须在。
        */}
        <p className="pt-1 text-center text-xs leading-relaxed text-gray-400">
          登录验证码由第三方邮件服务 Resend 发送。
          <br />
          我们只发送验证码，不会用于其它用途。
        </p>
      </form>
    </div>
  )
}
