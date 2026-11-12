import { ViewTransition } from "react"
import HeroSection from "@/components/home/HeroSection"

/**
 * 首页。
 *
 * 2026-11 改版：按站长要求删掉了「关于我 / 兴趣爱好 / 座右铭」三段，
 * 首页**只保留欢迎界面**。原来那三段的内容已经在站点其它地方有归属
 * （文章、动态、简历），首页不再复述一遍。
 *
 * 保留 <ViewTransition>：首屏进入时的转场与页面切换动画依赖它。
 */
export default function HomePage() {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <HeroSection />
    </ViewTransition>
  )
}
