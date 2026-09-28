"use client"

import { useEffect } from "react"
import { ChevronDown } from "lucide-react"

import CyclingSubtitle from "./CyclingSubtitle"

/** Hero 四拍的入场延迟（ms），错峰出现制造层次 */
const ENTER_DELAY = { avatar: 0, title: 90, subtitle: 180, indicator: 320 }

export default function HeroSection() {
  /**
   * 暗色态挂在 <html> 上，而不是本组件的 state 上。
   *
   * 两个原因：
   * 1. 导航栏是另一个组件，只能靠根节点上的属性一起响应
   * 2. 全程零 React 重渲染，只改一个属性；所有视觉变化都在 CSS 里完成
   *
   * dataset.inkDark 对应属性 data-ink-dark。
   */
  const enterDark = () => {
    document.documentElement.dataset.inkDark = "true"
  }
  const leaveDark = () => {
    delete document.documentElement.dataset.inkDark
  }

  // 卸载时清掉，避免残留成「永远暗着」
  useEffect(() => leaveDark, [])

  const scrollToAbout = () => {
    document
      .getElementById("about")
      ?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section className="hero-aura relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 ink-wash-bg" />

      <div className="relative z-10 space-y-8">
        {/* Avatar placeholder */}
        <div
          className="hero-dimmable mx-auto w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center ring-4 ring-gray-200 animate-rise-in"
          style={{ animationDelay: `${ENTER_DELAY.avatar}ms` }}
        >
          <span className="text-3xl font-bold text-brand-navy">L</span>
        </div>

        <div className="space-y-4">
          {/*
            两层文字落在同一个网格单元里：容器按较宽的那层撑开，
            所以明暗切换时标题不会因为文字长度不同而抖动。
              · 上层 h1 是真实标题，进入暗色态时淡出
              · 下层箴言只在暗色态淡入，标 aria-hidden（装饰性，不打扰读屏）
            鼠标进入即切暗、离开即复原；卸载时上面已清理。
          */}
          <div
            className="grid"
            onMouseEnter={enterDark}
            onMouseLeave={leaveDark}
          >
            <h1 className="hero-title-swap col-start-1 row-start-1 self-center justify-self-center text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight animate-rise-in">
              你好，我是 LanKnight
            </h1>
            <p
              aria-hidden="true"
              className="hero-motto-swap col-start-1 row-start-1 self-center justify-self-center text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
            >
              天行健，君子以自强不息
            </p>
          </div>

          <CyclingSubtitle
            className="hero-dimmable animate-rise-in"
            delay={ENTER_DELAY.subtitle}
          />
        </div>
      </div>

      {/*
        滚动指示器用 inset-x-0 + flex 居中，而不是 left-1/2 + -translate-x-1/2：
        animate-rise-in 会动画 transform，与 translate 定位互相覆盖会让元素横向跳一下。
        另外内层 button 单独承担 animate-bounce，避免两个 animation 简写互相覆盖。
      */}
      <div
        className="hero-dimmable absolute bottom-8 inset-x-0 flex justify-center animate-rise-in"
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
