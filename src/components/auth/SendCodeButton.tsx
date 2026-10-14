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
    /*
     * ⚠️ 这个结构是**量出来之后**才定成这样的，别随手改回 flex-col + gap-1。
     *
     * 问题本质：错误提示原本占用布局高度 → wrapper 变高 →
     * 外层行（`items-center`）居中整个 wrapper → 按钮被顶偏。
     *
     * 实测数据（忘记密码页，用 mock 回 429 稳定造出报错）：
     *   报错前 wrapper h=44 →  label 中心 − 按钮中心 = 0px     ✓
     *   报错后 wrapper h=62 →  label 中心 − 按钮中心 = 9.5px   ✗  按钮被顶上去
     * 它**只在有提示时才歪**，所以静态截图永远是对的 ——
     * 这正是它难被发现、只能靠量才能定位的原因。
     *
     * 我试过但**不成功**的两种改法（留在这里，避免以后有人再试一遍）：
     *   1. 只把按钮包进固定高度的行 → 还是歪 9.5px。
     *      因为被居中/顶高的是整个 wrapper，提示那段高度仍然把 wrapper 推走。
     *   2. 外层行改 `items-start` → 反而歪 -12px。
     *      因为 label 与按钮的顶边本来就不在同一水平线（label 在行顶、按钮居中）。
     *
     * 现在的做法：按钮与提示一起放进**一个绝对定位的容器**。
     *   - 容器 `absolute` 后完全脱离文档流 → 提示出现与否都不改变行的布局
     *   - 容器用 `top-0 bottom-0 flex flex-col justify-center` 撑满行高并居中，
     *     于是**按钮的中心恒等于行的中心** → 与左侧 label 永远对齐
     *   - 提示排在按钮下方（`absolute top-full`），同样不占位、也不会压住下面的输入框
     *
     * 这需要外层行有 `relative`（各表单里已加）。
     */
    <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center">
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
      {error && (
        <p className="absolute right-0 top-full mt-1 max-w-[18rem] text-right text-xs leading-tight text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
