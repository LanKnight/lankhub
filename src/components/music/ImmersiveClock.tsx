"use client"

import { useEffect, useRef } from "react"

/**
 * 沉浸层的时钟：上面一行「年月日 + 星期」，下面一行「时:分」（字号略大）。
 *
 * 三个刻意的选择，都和安全/性能有关：
 *
 * 1. **不用 useState。** 沉浸层里有几百行歌词、还有平滑滚动与音频状态；
 *    每秒 setState 会让整棵子树重渲染。这里直接往 ref 的 textContent 里写，
 *    对 React 来说是"零重渲染"。
 *
 * 2. **首帧留空。** 服务端没有"当前时间"这回事，先渲染空字符串、挂载后立刻写入，
 *    既不会 hydration 不一致，也不会有"先显示一个错时间再跳一下"的闪烁。
 *    容器是绝对定位的，空→有内容不会推动任何布局。
 *
 * 3. **只在整分钟醒来。** 不显示秒就别每秒空转：
 *    算出到下一分钟的毫秒数，定时器对齐到 :00（+50ms 余量）再循环，
 *    顺带消掉了 setInterval 累积漂移。
 *
 * 另外：标签页切到后台时停表（没人看还每秒醒一次没意义），回来先补一次再继续。
 * 桌面专用 —— 手机上顶栏太窄，这块会挤掉歌名（外层用 `hidden md:block` 控制）。
 */
export default function ImmersiveClock() {
  const dateRef = useRef<HTMLSpanElement | null>(null)
  const timeRef = useRef<HTMLSpanElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const dateFmt = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    const weekFmt = new Intl.DateTimeFormat("zh-CN", { weekday: "long" })
    const timeFmt = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    let timer: ReturnType<typeof setTimeout> | null = null

    const paint = () => {
      const now = new Date()
      const dateText = `${dateFmt.format(now)} ${weekFmt.format(now)}`
      const timeText = timeFmt.format(now)

      if (dateRef.current) dateRef.current.textContent = dateText
      if (timeRef.current) timeRef.current.textContent = timeText
      // 悬停能看到完整信息（也方便无障碍读屏一次性读出，而不是每秒播报）
      if (boxRef.current) boxRef.current.title = `${dateText} ${timeText}`
    }

    const scheduleNextMinute = () => {
      const now = new Date()
      // 到下一个整分钟的毫秒数，再补 50ms 余量，避免卡在 59.99s 又触发一次
      const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50
      timer = setTimeout(() => {
        paint()
        scheduleNextMinute()
      }, delay)
    }

    paint()
    scheduleNextMinute()

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
      } else {
        // 回前台先补一次，别停在离开时的那一刻
        paint()
        if (!timer) scheduleNextMinute()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return (
    <div
      ref={boxRef}
      className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 select-none text-center md:block"
    >
      {/* 年月日 + 星期：小一号、字距略宽，做信息行 */}
      <p className="text-[11px] leading-none tracking-wide text-gray-400">
        <span ref={dateRef} />
      </p>
      {/* 时:分：略大、等宽数字（否则 11:11 与 22:22 宽度不同会左右微抖） */}
      <p className="mt-1.5 text-base leading-none font-medium tabular-nums text-gray-600">
        <span ref={timeRef} />
      </p>
    </div>
  )
}
