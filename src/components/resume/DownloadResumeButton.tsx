"use client"

import { useState } from "react"
import { Download } from "lucide-react"

export default function DownloadResumeButton() {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch("/api/resume/download")
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "下载失败" }))
        alert(data.error || "下载失败")
        setDownloading(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "resume.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert("下载失败，请稍后重试")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors"
    >
      <Download size={16} />
      {downloading ? "下载中..." : "下载完整简历"}
    </button>
  )
}
