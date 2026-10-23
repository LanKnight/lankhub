import { ViewTransition } from "react"
import HeroSection from "@/components/home/HeroSection"
import AboutSection from "@/components/home/AboutSection"
import HobbiesSection from "@/components/home/HobbiesSection"
import MottoSection from "@/components/home/MottoSection"
import Reveal from "@/components/ui/Reveal"

/*
 * 首屏两张底图**不需要** <link rel="preload">：
 * 两个场景层都在 DOM 里、两张 <img> 都是 eager 的，页面一解析就会各下一张
 * （正常态 fetchPriority="high"、江湖态 low），浏览器预扫描同样能提前发现。
 *
 * 试过手写 preload：SSR 出来的 HTML 里会变成 **8 条重复链接** ——
 * React 19 会把 `<link rel="preload">` 提升到 head，同时又保留了原位置那一份。
 * 浏览器按 URL 去重不会多下载，但 DOM 里多出 4 个节点纯属噪音，于是删掉。
 */
export default function HomePage() {
  return (
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
  )
}
