"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, Download, FileText, Loader2, Printer } from "lucide-react"
import { useToast } from "@/components/ui/Toast"

/**
 * 简历下载下拉菜单：一页版（站长上传的 PDF）与完整版（打印视图另存为 PDF）。
 *
 * 之所以对「一页版」用 fetch + blob 而不是直接 <a download>：
 * 接口要能在失败时回传 JSON 错误，直接跳转的话错误会变成裸 JSON 页面。
 */
export default function DownloadMenu({ hasPdf }: { hasPdf: boolean }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // 点击外部 / 按 Esc 关闭
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const downloadOnePage = async () => {
    setOpen(false)
    setDownloading(true)
    try {
      const res = await fetch("/api/resume/download")
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "下载失败" }))
        toast(data.error || "下载失败", "error")
        return
      }

      // 沿用服务端给的文件名（resume-姓名.pdf）
      const disposition = res.headers.get("Content-Disposition") || ""
      const matched = disposition.match(/filename="?([^";]+)"?/)
      const filename = matched?.[1] || "resume.pdf"

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast("下载失败，请稍后重试", "error")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={downloading}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors"
      >
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {downloading ? "下载中..." : "下载简历"}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        // 只用淡入（animate-fade-in 不碰 transform）：
        // 面板靠 left-1/2 + -translate-x-1/2 居中，若叠一个会动画 transform 的入场效果，
        // 两者互相覆盖会让面板横向跳一下
        <div
          role="menu"
          className="animate-fade-in absolute left-1/2 -translate-x-1/2 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20 text-left"
        >
          {hasPdf && (
            <button
              type="button"
              role="menuitem"
              onClick={downloadOnePage}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <FileText size={18} className="mt-0.5 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">
                  一页版简历
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  精简的一页 PDF，适合快速投递
                </span>
              </span>
            </button>
          )}

          <Link
            href="/resume/print"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
              hasPdf ? "border-t border-gray-100" : ""
            }`}
          >
            <Printer size={18} className="mt-0.5 shrink-0 text-gray-400" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                完整版简历
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                由本页内容整理，打印后「另存为 PDF」
              </span>
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}
