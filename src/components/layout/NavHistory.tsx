"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * 本次页面加载期间，站内客户端导航发生过几次。
 *
 * 用来判断「返回」能不能安全地走 history：
 * - 直接打开链接 / 从别的网站点进来 → 0，此时必须退到兜底页，
 *   否则 `router.back()` 会把用户带回那个外部网站
 * - 站内点了几下才走到当前页 → > 0，`router.back()` 能精确回到来处
 *
 * 整页刷新会把它重置为 0，这正是我们想要的语义：刷新之后
 * 「上一页」是否还在本站已经无法保证，宁可用兜底页。
 */
let inAppNavigations = 0

/** 是否存在可安全回退的站内历史 */
export function hasInAppHistory(): boolean {
  return inAppNavigations > 0
}

/**
 * 挂在根布局里的静默记录器（渲染 null）。
 *
 * 根布局在客户端导航时不会重新挂载，所以这个组件能跨越整次会话累计；
 * 而整页加载会重建模块，天然把计数清零。
 */
export default function NavHistoryTracker() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  useEffect(() => {
    // 首次挂载对应「这一次页面加载」，不计入站内导航
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    inAppNavigations += 1
  }, [pathname])

  return null
}
