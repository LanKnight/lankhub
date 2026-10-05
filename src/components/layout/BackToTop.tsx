"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

/**
 * 返回顶部悬浮按钮：滚动超过一屏后出现，平滑回顶。
 *
 * 放右下角而不是左下角：后台侧栏在桌面端占着左侧 224px，
 * 放左下角会正好压在侧栏上。
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="返回顶部"
      className="no-print fixed bottom-6 right-6 z-[100] w-10 h-10 flex items-center justify-center bg-gray-900/80 text-white rounded-full shadow-lg hover:bg-gray-900 transition-all duration-200 animate-fade-in"
    >
      <ArrowUp size={18} />
    </button>
  )
}
