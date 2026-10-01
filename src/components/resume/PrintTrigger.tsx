"use client"

import { useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"

/** 资源卡住时别一直不弹打印框 */
const READY_TIMEOUT_MS = 3000

/**
 * 打开打印视图后自动唤起打印对话框。
 *
 * 不在 SSR 阶段触发，而是等两件事就绪：
 * 1. 页面 load —— 否则头像等图片可能还没进来
 * 2. document.fonts.ready —— 否则「另存为 PDF」会落到后备中文字体上
 * 两者取竞速，超时兜底。
 */
export default function PrintTrigger() {
  useEffect(() => {
    let cancelled = false

    const ready = (async () => {
      if (document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          window.addEventListener("load", () => resolve(), { once: true })
        })
      }
      try {
        await document.fonts.ready
      } catch {
        // 老浏览器没有 document.fonts，直接继续
      }
    })()

    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, READY_TIMEOUT_MS)
    )

    void Promise.race([ready, timeout]).then(() => {
      if (!cancelled) window.print()
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-4 px-4 print:hidden">
      <Link
        href="/resume"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={16} />
        返回简历
      </Link>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
      >
        <Printer size={16} />
        打印 / 另存为 PDF
      </button>
    </div>
  )
}
