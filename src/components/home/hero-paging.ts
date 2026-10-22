"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * 首页首屏的「一屏一屏走」滚动。
 *
 * 需求来源：向下按钮本来只能点，而页面在顶部时鼠标随便一滚也能落到
 * 「关于我」那一屏 —— 于是按钮显得可有可无。这里让滚轮的下滚也走**同一个**
 * 函数、同一个落点，按钮就从「唯一的入口」变成「同一件事的可见提示」。
 *
 * 刻意不做的事：
 * - 不做整页分页：离开首屏后一切交还浏览器，「关于我」到页脚仍是自由滚动
 * - 不接管触屏、键盘、拖动滚动条
 * - 不在文中任何位置抢滚动，只在两处边界上动手（见下面的注释）
 */

/** 下一屏的锚点 id。AboutSection 上的 id 要与它一致 */
export const HERO_NEXT_ANCHOR = "about"

/**
 * 锁的**兜底上限**（ms），不是固定时长 —— 正常情况下动画一结束就解锁（见 lock()）。
 *
 * 为什么一开始就必须锁：一次滚轮/触控板手势往往连发好几个事件，而 Chromium 里
 * **任何原生滚动输入都会取消正在进行的平滑滚动**。只拦第一次的话，第二个事件就会
 * 让动画停在中途 —— 表现就是「滚一下卡在中间」。所以这段手势整体归我们。
 *
 * 为什么不能锁满 700ms 就完事：实测平滑滚动约 570ms 就结束了，锁满会让落点之后
 * 约 130ms 内的下一次滚动被白白吞掉（「滚了没反应」）。改成监听 `scrollend`，
 * 留着这个上限只为兜住「scrollend 不来的情况」（没发生位移 / 浏览器不支持）。
 */
export const WHEEL_LOCK_MS = 700

/**
 * 判定「在顶部」「正好停在下一屏边界」的容差（px）。
 * 给几像素是因为滚动位置会是小数，不能要求严格等于 0。
 */
const BOUNDARY_TOLERANCE_PX = 8

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * 缓动方式：reduced-motion 下直接到位。
 *
 * ⚠️ 必须写 "instant" 而不是 "auto"。
 * 全局 CSS 里有 `html { scroll-behavior: smooth }`，而 "auto" 的语义是
 * 「按 CSS 的 scroll-behavior 来」→ 会回落成平滑滚动，等于没降级。
 */
function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "instant" : "smooth"
}

interface HeroPagingOptions {
  anchorId?: string
  /**
   * 滚动开始前的回调（首页用它清掉首屏的「入定」暗色态）。
   *
   * ⚠️ 传进来的函数必须是稳定的（用 useCallback 包一层），
   * 否则每次渲染都会重建 wheel 监听。
   */
  onJump?: () => void
}

export function useHeroPaging({
  anchorId = HERO_NEXT_ANCHOR,
  onJump,
}: HeroPagingOptions = {}) {
  const lockedRef = useRef(false)

  const goToNextScreen = useCallback(() => {
    const anchor = document.getElementById(anchorId)
    // 没有下一屏就什么都不做，让滚轮照常原生滚动
    if (!anchor) return
    onJump?.()
    anchor.scrollIntoView({ behavior: scrollBehavior() })
  }, [anchorId, onJump])

  const goBackToTop = useCallback(() => {
    onJump?.()
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }, [onJump])

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    let onScrollEnd: (() => void) | null = null

    const unlock = () => {
      lockedRef.current = false
      if (fallbackTimer) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      if (onScrollEnd) {
        window.removeEventListener("scrollend", onScrollEnd)
        onScrollEnd = null
      }
    }

    const lock = () => {
      unlock()
      lockedRef.current = true
      // 动画真结束就解锁。锁的唯一目的是别让原生滚动打断动画，
      // 动画结束了还继续吞事件，用户感受到的就是「滚不动」
      onScrollEnd = () => unlock()
      window.addEventListener("scrollend", onScrollEnd, { once: true })
      fallbackTimer = setTimeout(unlock, WHEEL_LOCK_MS)
    }

    /**
     * reduced-motion 下不锁：动作是瞬间到位的，没有动画会被打断，
     * 锁住只会让接下来的滚动白白吞掉一拍。
     */
    const jump = (to: "next" | "top") => {
      if (!prefersReducedMotion()) lock()
      if (to === "next") goToNextScreen()
      else goBackToTop()
    }

    const onWheel = (event: WheelEvent) => {
      // 触控板捏合缩放会带 ctrlKey（浏览器把 pinch 报成 ctrl+wheel），那不是滚动意图
      if (event.ctrlKey) return

      // 覆盖层内部的滚动不该被接管（目前首页没有，留给以后的弹层）
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [aria-modal="true"]')
      ) {
        return
      }

      if (lockedRef.current) {
        // 手势还在走：连同惯性尾巴一起吞掉，否则平滑动画会被打断
        event.preventDefault()
        return
      }

      if (event.deltaY > 0) {
        // 只在页面顶部动手。离开首屏之后一律交给浏览器
        if (window.scrollY > BOUNDARY_TOLERANCE_PX) return
        if (!document.getElementById(anchorId)) return
        event.preventDefault()
        jump("next")
        return
      }

      if (event.deltaY < 0) {
        const anchor = document.getElementById(anchorId)
        if (!anchor) return
        // 严格对称：只有正好停在下一屏的落点（边界上）才允许回顶。
        // 放宽到「那一屏里的任何位置」会把人从正在读的正文里抢走。
        if (Math.abs(anchor.getBoundingClientRect().top) > BOUNDARY_TOLERANCE_PX) {
          return
        }
        event.preventDefault()
        jump("top")
      }
    }

    // passive: false 是必需的 —— 默认的 passive 监听里 preventDefault 无效
    window.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      window.removeEventListener("wheel", onWheel)
      unlock()
    }
  }, [anchorId, goToNextScreen, goBackToTop])

  return { goToNextScreen, goBackToTop }
}
