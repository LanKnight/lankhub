"use client"

import { Check, Copy, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type CopyState = "idle" | "copied" | "error"

interface CopyButtonProps {
  /** 要复制的原始文本（未高亮的纯代码） */
  text: string
  /** 无障碍名称中的对象名，如「复制代码」 */
  label?: string
}

const RESET_DELAY_MS = 1800

/**
 * 复制按钮。
 *
 * 优先使用异步剪贴板 API；在非安全上下文（比如局域网内用 http 访问）下
 * `navigator.clipboard` 不可用，降级到 textarea + execCommand。
 */
export default function CopyButton({ text, label = "代码" }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const copy = useCallback(async () => {
    const ok = await writeToClipboard(text)
    setState(ok ? "copied" : "error")
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setState("idle"), RESET_DELAY_MS)
  }, [text])

  const actionLabel =
    state === "copied" ? "已复制" : state === "error" ? "复制失败" : `复制${label}`

  return (
    <>
      <button
        type="button"
        onClick={copy}
        title={actionLabel}
        aria-label={actionLabel}
        data-state={state}
        className="copy-btn"
      >
        {state === "copied" ? (
          <Check size={13} aria-hidden="true" />
        ) : state === "error" ? (
          <TriangleAlert size={13} aria-hidden="true" />
        ) : (
          <Copy size={13} aria-hidden="true" />
        )}
        <span>{state === "copied" ? "已复制" : state === "error" ? "失败" : "复制"}</span>
      </button>
      {/* 按钮文案变化不会自动播报，用一个 live region 补上 */}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "已复制到剪贴板" : state === "error" ? "复制失败" : ""}
      </span>
    </>
  )
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒或非安全上下文，继续走降级路径
  }

  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    // 移出视口而不是 display:none —— 后者无法被 select() 选中
    textarea.style.position = "fixed"
    textarea.style.top = "-9999px"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
