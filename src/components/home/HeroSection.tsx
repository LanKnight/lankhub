"use client"

import { ChevronDown } from "lucide-react"

import CyclingSubtitle from "./CyclingSubtitle"
import HeroScene from "./HeroScene"
import HeroType from "./HeroType"
import { HERO_SCENES } from "./hero-scene"
import { useHeroPaging } from "./hero-paging"
import { useHeroScene } from "./use-hero-scene"

/** 首屏三拍的入场延迟（ms），错峰出现制造层次。头像已删，节奏沿用原来的 */
const ENTER_DELAY = { title: 0, subtitle: 120, indicator: 320 }

export default function HeroSection() {
  /*
   * 场景与切页是两件事，但共用同一个「离开首屏」的时机：
   * 滚轮把页面推走时，必须先把江湖态收回雪山态，
   * 否则下一次回到顶部会停在一个残留的暗场里。
   */
  const { scene, toggle, reset, handlers } = useHeroScene()
  const { goToNextScreen } = useHeroPaging({ onJump: reset })

  return (
    <section
      className="hero-aura relative min-h-[calc(100vh-4rem)] overflow-hidden"
      {...handlers}
    >
      {HERO_SCENES.map((scene) => (
        <HeroScene key={scene} scene={scene} />
      ))}

      {/*
        文字在左：两张参考图的主体都在右半边（雪山梅枝 / 江湖人物），
        左半边是成片的留白 —— 版式跟着画面走，而不是把字压在主体上。
      */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-end px-6 pb-28 sm:px-10 md:items-center md:pb-0 lg:px-16">
        <div className="max-w-2xl">
          <div className="grid">
            {/* 两层文字叠在同一格里：容器按较宽那层撑开，切换时标题不会横向抖动 */}
            <h1
              className="hero-display hero-title-swap col-start-1 row-start-1 self-center justify-self-start text-5xl sm:text-6xl lg:text-7xl animate-rise-in"
              style={{ animationDelay: `${ENTER_DELAY.title}ms` }}
            >
              {/* 中文题字一行、英文署名另起一行：这是刻意的版式，不是被挤断的 */}
              <span className="hero-title-cjk">
                <HeroType text="你好，我是" />
              </span>
              <span className="hero-title-latin">LanKnight</span>
            </h1>
            {/*
              箴言比标题小一号：它有 11 个字，和标题同号会在 lg 宽度上折成两行，
              而「自强 / 不息」这种断法很难看。不同字号不会引起切换抖动 ——
              两层都在同一个网格格里，格子的高度始终由较高的标题决定。
            */}
            <p
              aria-hidden="true"
              className="hero-display hero-motto-swap col-start-1 row-start-1 self-center justify-self-start text-3xl sm:text-5xl lg:text-6xl"
            >
              <HeroType text="天行健，君子以自强不息" />
            </p>
          </div>

          <CyclingSubtitle
            className="hero-display hero-subtitle mt-5 animate-rise-in"
            delay={ENTER_DELAY.subtitle}
          />

          {/*
            落款印章：只在江湖态浮现，正常态保持占位（opacity: 0），
            这样切换时文字块的高度不变，不会把副标题往上顶一下。
          */}
          <span className="hero-display hero-seal mt-8" aria-hidden="true">
            阑客
          </span>
        </div>
      </div>

      {/*
        滚动指示器用 inset-x-0 + flex 居中，而不是 left-1/2 + -translate-x-1/2：
        animate-rise-in 会动画 transform，与 translate 定位互相覆盖会让元素横向跳一下。
        另外内层 button 单独承担 animate-bounce，避免两个 animation 简写互相覆盖。

        ⚠️ 必须 z-20：上面的文字容器是「整屏高度的 flex 容器」且带 z-10，
        会连按钮所在的这条区域一起盖住 —— 少了这一层，按钮点不动（回归测试抓到的）。
      */}
      <div
        className="absolute bottom-8 inset-x-0 z-20 flex justify-center animate-rise-in"
        style={{ animationDelay: `${ENTER_DELAY.indicator}ms` }}
      >
        <button
          onClick={(event) => {
            // 首屏整块是「轻点切换图景」的热区，这里必须拦住，否则点按钮会顺带把图切了
            event.stopPropagation()
            goToNextScreen()
          }}
          className="hero-scroll-hint animate-bounce transition-colors"
          aria-label="向下滚动"
        >
          <ChevronDown size={28} />
        </button>
      </div>

      {/*
        键盘/读屏的等价入口：整块首屏的「轻点切换」对他们不可达，
        这里补一个视觉隐藏的按钮（不占界面空间，符合「不要太多按钮」）。
      */}
      <button
        type="button"
        className="sr-only"
        aria-pressed={scene === "jianghu"}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        切换首页图景
      </button>
    </section>
  )
}
