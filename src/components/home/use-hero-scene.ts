"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from "react"

import {
  HERO_INK_ATTR,
  HERO_SCENE_ATTR,
  HOVER_DWELL_MS,
  HOVER_GRACE_MS,
  INK_ARM_DELAY_MS,
  INK_RUN_MS,
  type HeroSceneName,
} from "./hero-scene"

/**
 * 首屏场景的状态机：雪山梅花（snow）↔ 江湖武侠（jianghu）。
 *
 * 输入有三路：
 * - 鼠标：悬停主标题，停留 HOVER_DWELL_MS 才切；离开立即回到 snow
 * - 触屏：没有悬停，轻点切换（所以 hover 那一路必须按 pointerType 挡掉触摸）
 * - 滚轮切页：由 useHeroPaging 的 onJump 调 reset，先把场景收回 snow
 *
 * 状态改变只做两件事：setState（为了 sr-only 按钮的 aria-pressed）
 * 和把属性写到 <html>（CSS 全量响应）。场景层本身不参与 React 渲染。
 */
export function useHeroScene() {
  const [scene, setScene] = useState<HeroSceneName>("snow")
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 进页宽限的截止时刻 */
  const readyAt = useRef(0)
  /** 指针当前是否在首屏内（鼠标） */
  const pointerInside = useRef(false)
  /** 最近一次指针类型：click 事件本身不带 pointerType，只能记下来 */
  const lastPointerType = useRef("mouse")
  /**
   * 墨晕转场的扩散起点（相对首屏的百分比）。
   * 鼠标进入标题的那个点最自然；触屏轻点则用它点下去的位置；键盘切换留空走默认。
   */
  const inkOrigin = useRef<{ x: number; y: number } | null>(null)

  /** 记下指针在首屏内的相对位置（%），供墨晕从该点扩散 */
  const rememberInkOrigin = useCallback(
    (event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      const hero = (event.currentTarget as HTMLElement).closest(".hero-aura")
      if (!(hero instanceof HTMLElement)) return
      const rect = hero.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      inkOrigin.current = {
        x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
        y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10,
      }
    },
    []
  )

  /**
   * 把起点写成 CSS 变量（--ink-x / --ink-y），给遮罩用。
   * 必须在 setScene 之前写：CSS 动画在属性匹配的瞬间就会读这两个变量。
   */
  const applyInkOrigin = useCallback(() => {
    const hero = document.querySelector<HTMLElement>(".hero-aura")
    const origin = inkOrigin.current
    if (!hero || !origin) return
    hero.style.setProperty("--ink-x", `${origin.x}%`)
    hero.style.setProperty("--ink-y", `${origin.y}%`)
  }, [])

  /**
   * 播一次墨晕：把开关置 "running"。
   *
   * 收回 "on" 的时机**以动画结束为准**（下面的 animationend 监听），
   * 不用固定定时器 —— 定时器要么太早（遮罩突然消失、画面闪一下），
   * 要么太晚（多挂 100ms 白算遮罩）。这里只留一个兜底超时：
   * reduced-motion 下动画被禁用、animationend 永远不来。
   */
  const armInk = useCallback(() => {
    const root = document.documentElement
    root.setAttribute(HERO_INK_ATTR, "running")
    if (inkTimer.current) clearTimeout(inkTimer.current)
    inkTimer.current = setTimeout(
      () => root.setAttribute(HERO_INK_ATTR, "on"),
      INK_RUN_MS * 2
    )
  }, [])

  // 墨晕动画播完 → 收起遮罩状态
  useEffect(() => {
    const heroNode = document.querySelector<HTMLElement>(".hero-aura")
    if (!heroNode) return
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName !== "hero-ink-spread") return
      document.documentElement.setAttribute(HERO_INK_ATTR, "on")
    }
    heroNode.addEventListener("animationend", onAnimationEnd)
    return () => heroNode.removeEventListener("animationend", onAnimationEnd)
  }, [])

  const clearDwell = useCallback(() => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current)
      dwellTimer.current = null
    }
  }, [])

  const scheduleSwitch = useCallback(() => {
    clearDwell()
    dwellTimer.current = setTimeout(() => {
      applyInkOrigin()
      armInk()
      setScene("jianghu")
    }, HOVER_DWELL_MS)
  }, [applyInkOrigin, armInk, clearDwell])

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

  /*
   * 进页 INK_ARM_DELAY_MS 之后才允许播墨晕转场（期间写 "off"）。
   * 首屏那次「属性从无到 snow」的匹配因此不会触发动画：
   * 首屏该立刻可见，而不是先被遮罩成空白再晕开。
   */
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute(HERO_INK_ATTR, "off")
    const timer = setTimeout(() => root.setAttribute(HERO_INK_ATTR, "on"), INK_ARM_DELAY_MS)
    return () => {
      clearTimeout(timer)
      root.removeAttribute(HERO_INK_ATTR)
    }
  }, [])

  // 卸载时清掉计时器与属性，避免影响别的页面
  useEffect(
    () => () => {
      if (inkTimer.current) clearTimeout(inkTimer.current)
      document.documentElement.removeAttribute(HERO_SCENE_ATTR)
    },
    []
  )

  /**
   * 回到正常态。滚轮切页前也走这里。
   * 这一路**不播墨晕**（页面正在被滚走），所以只改场景、不碰开关。
   */
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
      // 墨晕从这个进入点扩散（必须记在 enter 上，dwell 到期时已经晚了）
      rememberInkOrigin(event)
      if (performance.now() < readyAt.current) return // 交给宽限计时器补
      scheduleSwitch()
    },
    [rememberInkOrigin, scheduleSwitch]
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
    applyInkOrigin()
    armInk()
    setScene((current) => (current === "snow" ? "jianghu" : "snow"))
  }, [applyInkOrigin, armInk])

  /**
   * 记录这一次交互到底是鼠标还是触摸。
   *
   * ⚠️ 必须挂在**整块首屏**的 pointerdown 上：
   * 悬停热区收窄到主标题后，如果还在标题的 enter 里记录，
   * 那「点在标题以外」的地方就永远判定成鼠标，触屏轻点会直接失效（踩过）。
   */
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    lastPointerType.current = event.pointerType || "mouse"
  }, [])

  /**
   * 触屏轻点 = 切换图景。
   * 鼠标点击不参与（避免和「点向下按钮」「将来的链接」抢行为）。
   *
   * ⚠️ 悬停与轻点是**两个热区**，别合并：
   * - 悬停只挂在主标题那一小块（鼠标扫过页面任意处不应该换图景）
   * - 轻点挂在整块首屏 —— 触屏没有悬停，能点的范围太小会很难用
   */
  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (lastPointerType.current !== "touch") return
      if (event.defaultPrevented) return
      // 触屏没有悬停，墨晕就从手指点下去的位置扩散
      rememberInkOrigin(event)
      toggle()
    },
    [rememberInkOrigin, toggle]
  )

  return {
    scene,
    toggle,
    reset,
    /** 悬停：贴到「主标题」容器上 */
    hoverHandlers: { onPointerEnter, onPointerLeave },
    /** 轻点：贴到整块首屏上（pointerdown 只用来记录指针类型） */
    tapHandlers: { onPointerDown, onClick },
  }
}
