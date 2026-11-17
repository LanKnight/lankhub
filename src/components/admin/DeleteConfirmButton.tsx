"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"

/**
 * 通用删除确认按钮（后台列表用）。
 *
 * 两种模式：
 *  - **普通模式**（不传 `confirmName`）：点图标 → 就地出现「确认/取消」两步确认。
 *    用于动态这类轻量内容。
 *  - **手写确认模式**（传了 `confirmName`）：弹窗要求把标题/名称原文手打一遍，
 *    完全一致才允许点删除 —— 文章、合集用这个，防的是"点错行、删错内容"。
 *    服务端还会再比对一次（DELETE 带 ?confirm=），绕过前端也删不掉。
 */
export default function DeleteConfirmButton({
  apiPath,
  iconTitle = "删除",
  confirmLabel = "确认",
  warning,
  confirmName,
  resourceLabel = "内容",
  onSuccess,
}: {
  apiPath: string
  iconTitle?: string
  confirmLabel?: string
  /** 确认态下显示的前置说明（例如「该合集下 3 篇文章将移入未分类」） */
  warning?: string
  /** 传了就进入「手写确认」模式：必须原样输入这个字符串 */
  confirmName?: string
  /** 手写确认模式里的名词，如「文章」「合集」 */
  resourceLabel?: string
  /** 删除成功后的回调，参数是服务端返回的 JSON（可能为 null） */
  onSuccess?: (data: unknown) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [typed, setTyped] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const requiresTyping = Boolean(confirmName)
  const matched = requiresTyping
    ? typed.trim() === (confirmName ?? "").trim()
    : true

  const close = useCallback(() => {
    setConfirming(false)
    setError("")
    setTyped("")
  }, [])

  // 弹窗模式：打开时聚焦输入框、锁页面滚动、Esc 关闭
  useEffect(() => {
    if (!confirming || !requiresTyping) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    inputRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [confirming, requiresTyping, close])

  const handleDelete = async () => {
    if (!matched) return
    setLoading(true)
    setError("")
    try {
      // 手写确认模式把手打的内容一并带上，服务端会再比对一次
      const url = requiresTyping
        ? `${apiPath}?confirm=${encodeURIComponent(typed.trim())}`
        : apiPath
      const res = await fetch(url, { method: "DELETE" })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error || `删除失败 (${res.status})`)
        setLoading(false)
        // 停留在确认态，让用户看到错误原因
        return
      }

      if (requiresTyping) close()
      else setConfirming(false)
      onSuccess?.(data)
      router.refresh()
    } catch {
      setError("网络错误，请稍后重试")
      setLoading(false)
    }
  }

  /* ---------- 手写确认：弹窗 ---------- */
  if (confirming && requiresTyping) {
    return (
      <>
        <button
          onClick={() => setConfirming(true)}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          title={iconTitle}
          aria-label={iconTitle}
        >
          <Trash2 size={16} />
        </button>

        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`删除${resourceLabel}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 text-left shadow-xl">
            <h2 className="text-base font-bold text-gray-900">删除{resourceLabel}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              这会永久删除
              <span className="mx-1 font-medium text-gray-900">「{confirmName}」</span>
              及其相关内容，<strong className="text-red-600">无法恢复</strong>。
            </p>
            {warning && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {warning}
              </p>
            )}

            <label className="mt-4 block text-xs text-gray-500">
              请输入下面的{resourceLabel}标题以确认：
            </label>
            <p className="mt-1 select-all break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800">
              {confirmName}
            </p>
            <input
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onPaste={(event) => event.preventDefault()}
              placeholder={`输入${resourceLabel}标题`}
              spellCheck={false}
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              必须完全一致（已禁用粘贴，请手动输入）
            </p>

            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="text-sm text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!matched || loading}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? "删除中…" : `删除${resourceLabel}`}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  /* ---------- 普通模式：就地两步确认 ---------- */
  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        {warning && !error && (
          <p className="text-xs text-gray-400 text-right max-w-[220px]">{warning}</p>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : confirmLabel}
          </button>
          <button onClick={close} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
            取消
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
      title={iconTitle}
      aria-label={iconTitle}
    >
      <Trash2 size={16} />
    </button>
  )
}
