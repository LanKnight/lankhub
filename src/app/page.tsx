import { ViewTransition } from "react"
import HeroSection from "@/components/home/HeroSection"
import AboutSection from "@/components/home/AboutSection"
import HobbiesSection from "@/components/home/HobbiesSection"
import MottoSection from "@/components/home/MottoSection"
import Reveal from "@/components/ui/Reveal"

export default function HomePage() {
  return (
    <>
      {/*
        首屏两张底图按视口各预载一张（另一态的低优先级）：
        两态要即时切换，不能等 hover 时才开始下载，否则会闪一下空白。
        放在首页而不是根布局 —— 别的页面不需要这两张图。
      */}
      <link
        rel="preload"
        as="image"
        href="/images/home/hero-snow.webp"
        media="(min-width: 768px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/images/home/hero-jianghu.webp"
        media="(min-width: 768px)"
        fetchPriority="low"
      />
      <link
        rel="preload"
        as="image"
        href="/images/home/hero-snow-m.webp"
        media="(max-width: 767px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/images/home/hero-jianghu-m.webp"
        media="(max-width: 767px)"
        fetchPriority="low"
      />

      <ViewTransition enter="auto" exit="auto" default="none">
        <HeroSection />
        <Reveal>
          <AboutSection />
        </Reveal>
        <Reveal delay={100}>
          <HobbiesSection />
        </Reveal>
        <Reveal delay={150}>
          <MottoSection />
        </Reveal>
      </ViewTransition>
    </>
  )
}
