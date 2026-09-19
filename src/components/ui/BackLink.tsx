"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronLeft } from "lucide-react"

import { hasInAppHistory } from "@/components/layout/NavHistory"

interface BackLinkProps {
  /** 没有站内历史时的兜底目标（直接打开链接、从外站点进来时使用） */
  fallbackHref: string
  /** 文案。默认「返回」—— 目的地是「上一页」，写死具体名称在来处不同时会撒谎 */
  label?: string
  className?: string
}

/**
 * 页内返回入口。
 *
 * 有站内历史时走 `router.back()`：Next 在后退导航时会恢复原来的 URL
 * （含 `?page=3&q=xxx`）和滚动位置，这才是真正的「回到原来的位置」。
 * 没有站内历史时退到 `fallbackHref`，避免把用户带回别的网站。
 *
 * 实现上始终渲染成 `<a href={fallbackHref}>`，只在有历史时用 onClick 拦截：
 * - 服务端与客户端首帧结构完全一致，不存在水合不一致
 * - 禁用 JS 时它仍是一个可用的普通链接，且能被爬虫抓取
 */
export default function BackLink({
  fallbackHref,
  label = "返回",
  className,
}: BackLinkProps) {
  const router = useRouter()
  // 惰性初始化里读取外部状态：放进 effect 里 setState 会造成级联渲染。
  // 这个值只影响 onClick，不影响渲染结果，所以服务端与客户端首帧结构一致，
  // 不存在水合不一致；每次导航后组件重新挂载会读到最新计数。
  const [canGoBack] = useState(hasInAppHistory)

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        if (!canGoBack) return
        event.preventDefault()
        router.back()
      }}
      className={`inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors ${
        className ?? ""
      }`}
    >
      <ChevronLeft size={16} />
      {label}
    </Link>
  )
}
