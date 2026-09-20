"use client"

import { ChevronDown } from "lucide-react"

import CyclingSubtitle from "./CyclingSubtitle"

/** Hero 四拍的入场延迟（ms），错峰出现制造层次 */
const ENTER_DELAY = { avatar: 0, title: 90, subtitle: 180, indicator: 320 }

export default function HeroSection() {
  const scrollToAbout = () => {
    document
      .getElementById("about")
      ?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 ink-wash-bg" />

      <div className="relative z-10 space-y-8">
        {/* Avatar placeholder */}
        <div
          className="mx-auto w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center ring-4 ring-gray-200 animate-rise-in"
          style={{ animationDelay: `${ENTER_DELAY.avatar}ms` }}
        >
          <span className="text-3xl font-bold text-brand-navy">L</span>
        </div>

        <div className="space-y-4">
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight animate-rise-in"
            style={{ animationDelay: `${ENTER_DELAY.title}ms` }}
          >
            你好，我是 <span className="text-gray-900">lank</span>
          </h1>
          <CyclingSubtitle className="animate-rise-in" delay={ENTER_DELAY.subtitle} />
        </div>
      </div>

      {/*
        滚动指示器用 inset-x-0 + flex 居中，而不是 left-1/2 + -translate-x-1/2：
        animate-rise-in 会动画 transform，与 translate 定位互相覆盖会让元素横向跳一下。
        另外内层 button 单独承担 animate-bounce，避免两个 animation 简写互相覆盖。
      */}
      <div
        className="absolute bottom-8 inset-x-0 flex justify-center animate-rise-in"
        style={{ animationDelay: `${ENTER_DELAY.indicator}ms` }}
      >
        <button
          onClick={scrollToAbout}
          className="animate-bounce text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="向下滚动"
        >
          <ChevronDown size={28} />
        </button>
      </div>
    </section>
  )
}
