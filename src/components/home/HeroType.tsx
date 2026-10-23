import { HERO_CHAR_RHYTHM, isRhythmChar } from "./hero-scene"

/**
 * 首屏大字（标题 / 箴言）的字形节奏。
 *
 * 把 CJK 逐字拆开、套上 HERO_CHAR_RHYTHM 里的字号与下沉量，做出手写那种
 * 「大小不一、重心不齐」的错落感；拉丁（LanKnight）与空格**整段不拆**，
 * 保持衬线的正常排版 —— 中文题字 + 英文署名。
 *
 * 为什么用 span 而不是 CSS 的 nth-child 之类：字号是要逐字不同的，
 * 只能落实到元素上；同时拆成 span 不影响文本内容、复制与读屏（文字仍是原文）。
 * 注意 .hero-char 是 inline-block —— 行内元素上的 transform 不生效。
 */
export default function HeroType({ text }: { text: string }) {
  let rhythmIndex = 0

  return (
    <>
      {[...text].map((ch, index) => {
        if (!isRhythmChar(ch)) {
          return <span key={`${index}-${ch}`}>{ch}</span>
        }

        const rhythm = HERO_CHAR_RHYTHM[rhythmIndex % HERO_CHAR_RHYTHM.length]
        rhythmIndex += 1

        return (
          <span
            key={`${index}-${ch}`}
            className="hero-char"
            style={{
              fontSize: `${rhythm.size}em`,
              transform: `translateY(${rhythm.dy}em)`,
            }}
          >
            {ch}
          </span>
        )
      })}
    </>
  )
}
