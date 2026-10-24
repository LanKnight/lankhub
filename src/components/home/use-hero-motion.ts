"use client"

import { useEffect, useRef } from "react"

/**
 * 首屏动态的「开关」：只在首屏可见且页面在前台时才让动画跑。
 *
 * 为什么需要它：雪、鸟、月晕、灯火都是 `infinite` 动画。滚到下面看文章时
 * 这些动画仍在跑，白白占用合成器与电量。CSS 没法知道「元素是否在视口里」，
 * 只能由 JS 标一个属性。
 *
 * 这里**不碰任何 React 状态**，只往 <html> 写一个 `data-hero-motion`：
 * - 首屏不可见，或标签页被切走 → "paused"
 * - 否则移除属性（CSS 里默认就是 running）
 *
 * 刻意不做的事：
 * - 不做指针视差（那是下一批的内容）
 * - 不判断 prefers-reduced-motion —— 那一条交给 CSS 媒体查询，
 *   避免 JS 与 CSS 两处各维护一份状态
 */
export function useHeroMotion() {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const root = document.documentElement
    let inView = true

    const apply = () => {
      const paused = !inView || document.hidden
      if (paused) root.dataset.heroMotion = "paused"
      else delete root.dataset.heroMotion
    }

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              inView = entries[0]?.isIntersecting ?? true
              apply()
            },
            // 留一点余量：快滚回来时动画已经在跑，不会「刚回到首屏还停着」
            { rootMargin: "120px" }
          )

    observer?.observe(element)
    document.addEventListener("visibilitychange", apply)
    apply()

    return () => {
      observer?.disconnect()
      document.removeEventListener("visibilitychange", apply)
      delete root.dataset.heroMotion
    }
  }, [])

  return ref
}
