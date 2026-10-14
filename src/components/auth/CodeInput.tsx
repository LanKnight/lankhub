"use client"

import { useEffect, useRef } from "react"

/** 验证码位数。与 src/lib/validations.ts 的 VerifyCodeSchema 必须一致 */
export const CODE_LENGTH = 6

/**
 * 6 位验证码输入。
 *
 * 做成 6 个单格而不是一个输入框，是为了几个实际体验细节：
 *   - `inputMode="numeric"` 让手机弹数字键盘
 *   - `autoComplete="one-time-code"` 让 iOS/Android 能从邮件里**自动填充**
 *   - 输满自动跳到下一格；退格时若当前为空则退回上一格
 *   - 支持直接粘贴一整串（邮箱里复制验证码是最常见的操作路径）
 *
 * 为什么不用一个 `<input maxLength=6>`：那样粘贴当然也能用，
 * 但自动填充与逐位纠错的手感差很多，而验证码这一步是用户最容易放弃的地方。
 */
export default function CodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  /** 输满时触发（用于「输满自动提交」） */
  onComplete,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  autoFocus?: boolean
  onComplete?: (code: string) => void
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  // 用数组渲染固定 6 格，value 里没有的位置就是空
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "")

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  /** 把某一位替换成新字符，并返回新值 */
  function setAt(index: number, char: string): string {
    const arr = digits.slice()
    arr[index] = char
    return arr.join("")
  }

  function focusAt(index: number) {
    const el = refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]
    el?.focus()
    el?.select()
  }

  function handleChange(index: number, raw: string) {
    // 只保留数字：用户可能输入全角数字或混入别的字符
    const digitsOnly = raw.replace(/\D/g, "")
    if (!digitsOnly) {
      onChange(setAt(index, ""))
      return
    }

    /*
     * 一次输入多个字符的情况：
     *  - 粘贴整串「123456」
     *  - 手机自动填充（一次性把 6 位塞进第一格）
     * 两种都应当从当前位置起依次铺开，而不是只取第一个字符。
     */
    if (digitsOnly.length > 1) {
      const arr = digits.slice()
      for (let i = 0; i < digitsOnly.length && index + i < CODE_LENGTH; i++) {
        arr[index + i] = digitsOnly[i]
      }
      const next = arr.join("")
      onChange(next)
      // 焦点落到最后一个填上的格子之后
      focusAt(Math.min(index + digitsOnly.length, CODE_LENGTH - 1))
      if (next.length === CODE_LENGTH && onComplete) onComplete(next)
      return
    }

    const next = setAt(index, digitsOnly)
    onChange(next)
    if (index < CODE_LENGTH - 1) focusAt(index + 1)
    if (next.replace(/\D/g, "").length === CODE_LENGTH && onComplete) {
      onComplete(next)
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        // 当前格有值：清掉它，焦点不动（符合直觉）
        onChange(setAt(index, ""))
        return
      }
      // 当前格已空：退回上一格并清掉
      if (index > 0) {
        e.preventDefault()
        onChange(setAt(index - 1, ""))
        focusAt(index - 1)
      }
      return
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      focusAt(index - 1)
    }
    if (e.key === "ArrowRight") {
      e.preventDefault()
      focusAt(index + 1)
    }
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    handleChange(index, e.clipboardData.getData("text"))
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="验证码">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          // 只有第一格挂 one-time-code：挂在每一格上会让自动填充行为变得不确定
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={CODE_LENGTH}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`验证码第 ${i + 1} 位`}
          className="h-11 w-10 rounded-lg border border-gray-300 text-center text-lg font-medium tabular-nums text-gray-900 outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
        />
      ))}
    </div>
  )
}
