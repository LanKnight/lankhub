"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { describeCoverRatio, type CoverRatioHint } from "./cover-hint"

/**
 * 读封面预览图的真实尺寸，给出"会被裁掉多少"的提示。
 *
 * 为什么不只是挂个 `onLoad`：
 * 预览图是**服务端渲染**的 `<img>`，如果图片在 hydration 之前就已经加载完
 * （浏览器缓存、或者本地文件），`load` 事件在我们挂上监听前就发生过了 ——
 * `onLoad` 永远不会触发，提示也就永远不出现。
 * 实测就是这样：先看过一篇文章再进合集编辑页，提示始终为空。
 *
 * 所以这里做两件事：
 *   1. 挂载后先检查 `img.complete && naturalWidth`，已经加载完就直接算；
 *   2. 没加载完就等 `onLoad`（由调用方挂回同一个 <img>）。
 *
 * 传空字符串（移除封面）时会把提示清掉。
 */
export function useCoverRatioHint(src: string) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [hint, setHint] = useState<CoverRatioHint | null>(null)

  const measure = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight) return false
    setHint(describeCoverRatio(img.naturalWidth, img.naturalHeight))
    return true
  }, [])

  useEffect(() => {
    if (!src) {
      setHint(null)
      return
    }
    // 已经加载完（缓存命中）时 load 事件不会再来，这里补一次
    measure()
    // 依赖 src：换封面后重新量
  }, [src, measure])

  return { imgRef, hint, setHint, measure }
}
