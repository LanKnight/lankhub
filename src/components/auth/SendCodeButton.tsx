"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Send } from "lucide-react"

/**
 * 「发送验证码」按钮 + 60 秒倒计时。
 *
 * 倒计时为什么是**必需的**而不是锦上添花：
 * 服务端有 60 秒冷却，若界面不显示倒计时，用户在冷却期间点击只会看到
 * 一句「请求过于频繁」——他会以为功能坏了，然后反复点。
 * 把服务端的约束**提前画在界面上**，是让限流不显得像 bug 的关键。
 *
 * 倒计时秒数必须与 src/lib/email/verify-code.ts 的 COOLDOWN_SECONDS 一致。
 */
const COOLDOWN_SECONDS = 60

export default function SendCodeButton({
  onSend,
  disabled = false,
  label = "获取验证码",
}: {
  /** 返回 null 表示发送成功；返回字符串表示要显示的错误 */
  onSend: () => Promise<string | null>
  disabled?: boolean
  label?: string
}) {
  const [seconds, setSeconds] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 卸载时清掉定时器，否则组件走了定时器还在跑（会 setState 到已卸载组件）
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  function startCountdown() {
    setSeconds(COOLDOWN_SECONDS)
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  async function handleClick() {
    if (sending || seconds > 0 || disabled) return
    setError("")
    setSending(true)
    try {
      const err = await onSend()
      if (err) {
        setError(err)
        /*
         * 服务端返回冷却类错误时也要起倒计时。
         * 否则会出现「服务端说还要等 43 秒，而按钮却立即可点」的矛盾状态 ——
         * 用户点一次被拒一次。这里统一按 60 秒起，宁可多等几秒。
         */
        if (/频繁|稍后再试|秒后/.test(err)) startCountdown()
        return
      }
      startCountdown()
    } catch {
      setError("发送失败，请稍后重试")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={sending || seconds > 0 || disabled}
        className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" />
            发送中
          </span>
        ) : seconds > 0 ? (
          `${seconds} 秒后重发`
        ) : (
          <span className="flex items-center gap-1.5">
            <Send size={14} />
            {label}
          </span>
        )}
      </button>
      {error && <p className="max-w-[16rem] text-right text-xs text-red-500">{error}</p>}
    </div>
  )
}
