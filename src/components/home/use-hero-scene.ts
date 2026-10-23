"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from "react"

import {
  HERO_SCENE_ATTR,
  HOVER_DWELL_MS,
  HOVER_GRACE_MS,
  type HeroSceneName,
} from "./hero-scene"

/**
 * 首屏场景的状态机：雪山梅花（snow）↔ 江湖武侠（jianghu）。
 *
 * 输入有三路：
 * - 鼠标：整块首屏悬停，停留 HOVER_DWELL_MS 才切；离开立即回到 snow
 * - 触屏：没有悬停，轻点切换（所以 hover 那一路必须按 pointerType 挡掉触摸）
 * - 滚轮切页：由 useHeroPaging 的 onJump 调 reset，先把场景收回 snow
 *
 * 状态改变只做两件事：setState（为了 sr-only 按钮的 aria-pressed）
 * 和把属性写到 <html>（CSS 全量响应）。场景层本身不参与 React 渲染。
 */
export function useHeroScene() {
  const [scene, setScene] = useState<HeroSceneName>("snow")
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 进页宽限的截止时刻 */
  const readyAt = useRef(0)
  /** 指针当前是否在首屏内（鼠标） */
  const pointerInside = useRef(false)
  /** 最近一次指针类型：click 事件本身不带 pointerType，只能记下来 */
  const lastPointerType = useRef("mouse")

  const clearDwell = useCallback(() => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current)
      dwellTimer.current = null
    }
  }, [])

  const scheduleSwitch = useCallback(() => {
    clearDwell()
    dwellTimer.current = setTimeout(() => setScene("jianghu"), HOVER_DWELL_MS)
  }, [clearDwell])

  useEffect(() => {
    readyAt.current = performance.now() + HOVER_GRACE_MS

    /*
     * 宽限结束时如果指针**已经**在首屏里，要补一次调度 ——
     * 否则「页面加载时鼠标就停在首屏」的情况会永远等不到下一次 pointerenter，
     * 悬停态就等于失效了（回归测试里就是这么发现的）。
     */
    const timer = setTimeout(() => {
      if (pointerInside.current) scheduleSwitch()
    }, HOVER_GRACE_MS)
    return () => clearTimeout(timer)
  }, [scheduleSwitch])

  // 场景写进 <html>：所有视觉都在 CSS 里响应
  useEffect(() => {
    document.documentElement.setAttribute(HERO_SCENE_ATTR, scene)
  }, [scene])

  // 离开首页必须清掉，否则别的页面会带着江湖夜色
  useEffect(
    () => () => {
      document.documentElement.removeAttribute(HERO_SCENE_ATTR)
    },
    []
  )

  /** 回到正常态。滚轮切页前也走这里 */
  const reset = useCallback(() => {
    clearDwell()
    setScene("snow")
  }, [clearDwell])

  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      lastPointerType.current = event.pointerType || "mouse"
      if (event.pointerType === "touch") {
        // 触屏走轻点，不靠悬停；也不要把它算成「指针在内部」，否则宽限结束会误切
        pointerInside.current = false
        return
      }
      pointerInside.current = true
      if (performance.now() < readyAt.current) return // 交给宽限计时器补
      scheduleSwitch()
    },
    [scheduleSwitch]
  )

  const onPointerLeave = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      lastPointerType.current = event.pointerType || "mouse"
      if (event.pointerType === "touch") return
      pointerInside.current = false
      reset()
    },
    [reset]
  )

  const toggle = useCallback(() => {
    setScene((current) => (current === "snow" ? "jianghu" : "snow"))
  }, [])

  /**
   * 触屏轻点 = 切换图景。
   * 鼠标点击不参与（避免和「点向下按钮」「将来的链接」抢行为）。
   */
  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (lastPointerType.current !== "touch") return
      if (event.defaultPrevented) return
      toggle()
    },
    [toggle]
  )

  return {
    scene,
    toggle,
    reset,
    handlers: { onPointerEnter, onPointerLeave, onClick },
  }
}
