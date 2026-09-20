import type { CSSProperties } from "react"

/**
 * Hero 循环副标题的文案。
 * ⚠️ 每句请控制在 ~16 个汉字以内：容器是固定高度的单行盒，
 * 过长会在窄屏换行从而被裁掉。
 */
const SUBTITLES = [
  "码农 · 游戏玩家 · 生活记录者",
  "全栈开发",
  "云原生",
  "AI 探索者",
]

/** 每句停留时长（秒） */
const DWELL_SECONDS = 3

interface CyclingSubtitleProps {
  className?: string
  /** 入场动画延迟（ms） */
  delay?: number
}

/**
 * 循环切换的副标题。
 *
 * 纯 CSS 实现，不用 JS 也不用定时器：所有句子绝对定位叠放，共用一套关键帧，
 * 靠内联的 animation-duration（整轮时长）与 animation-delay（自身序号 × 停留时长）错开。
 * 因此改文案只要改上面的数组，关键帧不用动，句数也不受限。
 *
 * 高度固定为一行，避免每句字数不同导致下方内容上下抖动。
 * 鼠标悬停会暂停（globals.css 里的 :hover 规则），
 * 「减少动态效果」下退化为只静态显示第一句。
 */
export default function CyclingSubtitle({
  className,
  delay = 0,
}: CyclingSubtitleProps) {
  const cycleSeconds = SUBTITLES.length * DWELL_SECONDS

  return (
    <p
      className={`hero-subtitle-cycle relative h-7 text-lg sm:text-xl text-gray-500 ${
        className ?? ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {SUBTITLES.map((text, index) => (
        <span
          key={text}
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          style={
            {
              "--subtitle-cycle": `${cycleSeconds}s`,
              "--subtitle-delay": `${index * DWELL_SECONDS}s`,
            } as CSSProperties
          }
        >
          {text}
        </span>
      ))}
    </p>
  )
}
