"use client"

import { useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

import CyclingSubtitle from "./CyclingSubtitle"

/** Hero 四拍的入场延迟（ms），错峰出现制造层次 */
const ENTER_DELAY = { avatar: 0, title: 90, subtitle: 180, indicator: 320 }

export default function HeroSection() {
  const spotlightRef = useRef<HTMLDivElement>(null)
  const [spotVisible, setSpotVisible] = useState(false)

  /**
   * 光斑跟随鼠标。
   *
   * 坐标直接写进 CSS 变量，不走 React state —— 否则每秒几十次 mousemove
   * 会触发同样次数的重渲染。只有「显示/隐藏」这个布尔量交给 state 管理，
   * 它每次进出标题才变化一次。
   */
  const handleTitleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const layer = spotlightRef.current
    if (!layer) return
    // 用承载两层的网格容器算相对坐标：它的内容盒就是覆盖层的盒子，遮罩才对齐
    const box = event.currentTarget.getBoundingClientRect()
    layer.style.setProperty("--spot-x", `${event.clientX - box.left}px`)
    layer.style.setProperty("--spot-y", `${event.clientY - box.top}px`)
    setSpotVisible(true)
  }

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
          {/*
            双层文字：两层落在同一个网格单元里，容器会按较宽的那层撑开，
            这样遮罩坐标对两层才一致。
              · 上层 h1 是真实标题，始终可见，从不被遮罩改动
              · 下层覆盖层自带纸张底色 + 箴言，整体被圆形遮罩限制住
            鼠标离开时只把覆盖层整层淡出，标题本身没有被挖洞，不存在「补不上洞」的风险。
          */}
          <div
            className="grid"
            onMouseMove={handleTitleMove}
            onMouseLeave={() => setSpotVisible(false)}
          >
            <h1
              className="col-start-1 row-start-1 self-center justify-self-center text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight animate-rise-in"
              style={{ animationDelay: `${ENTER_DELAY.title}ms` }}
            >
              你好，我是 LanKnight
            </h1>

            <div
              ref={spotlightRef}
              aria-hidden="true"
              data-visible={spotVisible}
              className="hero-spotlight col-start-1 row-start-1 flex items-center justify-center bg-paper"
            >
              <span className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900">
                天行健，君子以自强不息
              </span>
            </div>
          </div>

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
