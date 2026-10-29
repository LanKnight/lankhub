"use client"

import { useEffect } from "react"

/**
 * 与 globals.css 里标题的 scroll-margin-top（5rem = 80px）配套：
 * 点目录后标题会停在距顶 80px 处，判定线取 96px 就能把它算作「已进入该章节」。
 * 两个值必须一起改。
 */
const ACTIVE_LINE_PX = 96

/**
 * 目录的滚动高亮 + 窄屏折叠面板的收起。
 *
 * 刻意不渲染任何内容：目录链接是服务端渲染的静态 HTML，没有 JS 也能用。
 * 这里只负责给当前章节对应的那条链接打上 data-active，
 * 直接用 DOM 操作而不是 React state —— 避免滚动时高频触发重渲染。
 */
export default function TocSpy({ ids }: { ids: string[] }) {
  useEffect(() => {
    const links = new Map<string, HTMLElement>()
    document.querySelectorAll<HTMLElement>("[data-toc-id]").forEach((el) => {
      const id = el.dataset.tocId
      if (id) links.set(id, el)
    })

    const headings = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    if (headings.length === 0) return

    /**
     * 找到"能滚的那个祖先"：目录比视口高时，宽屏侧栏会给它套一个
     * .toc-scroll（overflow-y: auto）。找不到就说明目录没溢出，不需要跟随。
     *
     * 注意不能用 `scrollIntoView` 让高亮进来 —— 它按定义会滚动**所有**可滚祖先，
     * 包括正文所在的页面，表现就是"目录跟着动，正文也被滚走了"。
     * 这里改成手算距离后写 scrollTop，只影响这一个容器。
     */
    const scroller = (() => {
      const first = links.values().next().value
      let el = first?.parentElement ?? null
      while (el) {
        const cs = getComputedStyle(el)
        const scrollable = cs.overflowY === "auto" || cs.overflowY === "scroll"
        if (scrollable && el.scrollHeight > el.clientHeight + 1) return el
        el = el.parentElement
      }
      return null
    })()
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    /** 高亮项滚出目录可视区时，把它带回来（只在"当前章节变了"时做一次） */
    const followActive = (el: HTMLElement) => {
      if (!scroller) return
      const box = scroller.getBoundingClientRect()
      const item = el.getBoundingClientRect()
      const margin = 8
      if (item.top >= box.top + margin && item.bottom <= box.bottom - margin) return

      const target =
        scroller.scrollTop + (item.top - box.top) - scroller.clientHeight / 2 + item.height / 2
      scroller.scrollTo({
        top: Math.max(0, target),
        behavior: reduceMotion ? "auto" : "smooth",
      })
    }

    let frame = 0
    let lastActive = ""
    const update = () => {
      frame = 0

      // 最后一个越过判定线的标题就是当前章节
      let current = headings[0].id
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= ACTIVE_LINE_PX) {
          current = heading.id
        } else {
          break
        }
      }

      // 滚到底时强制点亮最后一条：末尾章节很短的话，它可能永远越不过判定线
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      if (atBottom) current = headings[headings.length - 1].id

      for (const [id, el] of links) {
        el.dataset.active = id === current ? "true" : "false"
      }

      // 只在章节变化时跟随：否则用户手动把目录滚开，下一帧又会被拽回去
      if (current !== lastActive) {
        lastActive = current
        const el = links.get(current)
        if (el) followActive(el)
      }
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [ids])

  // 点目录项后收起窄屏的 <details> 面板，否则跳过去还盖着一大块
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest("[data-toc-id]")
      if (!link) return
      const details = link.closest("details")
      if (details) details.open = false
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])

  return null
}
