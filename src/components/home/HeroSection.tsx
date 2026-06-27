"use client"

import { useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"

export default function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) {
      el.classList.add("opacity-0")
      requestAnimationFrame(() => {
        el.classList.add("transition-opacity", "duration-1000")
        el.classList.remove("opacity-0")
      })
    }
  }, [])

  const scrollToAbout = () => {
    document
      .getElementById("about")
      ?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section
      ref={ref}
      className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-navy/5 via-transparent to-transparent" />

      <div className="relative z-10 space-y-8">
        {/* Avatar placeholder */}
        <div className="mx-auto w-28 h-28 rounded-full bg-gradient-to-br from-brand-cyan/30 to-accent/30 flex items-center justify-center ring-4 ring-white shadow-xl">
          <span className="text-3xl font-bold text-brand-navy">L</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight">
            你好，我是{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-navy to-accent">
              lank
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-lg mx-auto">
            码农 · 游戏玩家 · 生活记录者
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={scrollToAbout}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="向下滚动"
      >
        <ChevronDown size={28} />
      </button>
    </section>
  )
}
