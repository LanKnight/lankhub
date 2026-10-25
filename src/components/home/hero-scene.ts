/**
 * 首屏场景的「参数表」。
 *
 * 刻意把参数（这里）、布局（HeroScene / HeroSection）与样式（globals.css）分开：
 * 阶段 1 调构图只需要改这个文件和 CSS 变量，不用动结构。
 */

/** 两个场景。将来要加第三态，只在这个数组和 CSS 里加一项 */
export const HERO_SCENES = ["snow", "jianghu"] as const
export type HeroSceneName = (typeof HERO_SCENES)[number]

/**
 * 状态写在 <html> 上，CSS 全量响应。
 * 沿用原来 `data-ink-dark` 的思路（零 React 重渲染、无水合时序问题），
 * 只是把「入定暗色」升级成「场景」。
 */
export const HERO_SCENE_ATTR = "data-hero-scene"

/**
 * 进页宽限（ms）：这段时间内不响应悬停。
 *
 * 为什么要它：鼠标进页面时常常正好划过主标题（标题在首屏左侧居中），
 * 没有宽限的话一进来就切到江湖态，雪山态几乎永远看不到。
 */
export const HOVER_GRACE_MS = 1200

/**
 * 指针停留多久才切（防误触）。离开立即恢复，恢复侧不加延迟。
 *
 * 悬停热区是**主标题那一块**（不是整屏）：鼠标扫过页面别处、扫过副标题、
 * 扫过画面留白，都不该换图景。触屏另走「整屏轻点」。
 */
export const HOVER_DWELL_MS = 300

/**
 * 首屏显示字体：志莽行书（站长选定）。
 *
 * 中文来自**按字子集**（13KB，只带首屏用得上的约 40 个字），拉丁故意不用它 ——
 * `@font-face` 里用 `unicode-range` 把文件限制在 CJK 范围，
 * 拉丁就会回落到全站衬线，形成「中文题字 + 英文署名」的搭配。
 *
 * ⚠️ 改首屏文案要同步重新生成子集，否则新字会掉回系统字体（见 docs/HISTORY 第 30 节）。
 */
export const HERO_DISPLAY_FONT = "Hero Xingshu"

/**
 * 逐字错落的节奏表（Q28：要「不对称的美感」）。
 *
 * 用固定表而不是随机：随机每次渲染都不一样，看起来像抖动而不是书法；
 * 手写的错落是有规律的。`size` 是相对父级的字号倍数，`dy` 是下沉量（em）。
 * CJK 字逐字套这张表，拉丁与空格整段不拆。
 */
export interface HeroCharRhythm {
  size: number
  dy: number
}

export const HERO_CHAR_RHYTHM: HeroCharRhythm[] = [
  { size: 1.0, dy: 0 },
  { size: 0.94, dy: 0.02 },
  { size: 1.07, dy: -0.012 },
  { size: 0.92, dy: 0.028 },
  { size: 1.03, dy: -0.004 },
  { size: 0.97, dy: 0.014 },
  { size: 1.09, dy: -0.02 },
  { size: 0.95, dy: 0.022 },
  { size: 1.01, dy: 0.004 },
  { size: 0.9, dy: 0.018 },
  { size: 1.05, dy: -0.008 },
  { size: 0.98, dy: 0.01 },
]

/** 判定哪些字要套节奏：CJK 汉字 + 中文标点，拉丁/数字/空格不套 */
export function isRhythmChar(ch: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff\u3001\u3002\uff0c\uff1a\uff1b\uff1f\uff01]/.test(ch)
}


export interface HeroSceneAsset {
  /** 桌面图（1672×941，q82） */
  desktop: string
  /**
   * 手机竖版。
   * 原图 16:9 在手机视口想铺满会被横裁掉约七成，梅枝/人物都会被切没，
   * 所以另出了一版「右侧主体 + 底部纸色延展」的竖图（780×1272）。
   */
  mobile: string
  /** cover 时的对齐点：两幅画的主体高度不同，各自调 */
  objectPosition: string
}

export const HERO_SCENE_ASSETS: Record<HeroSceneName, HeroSceneAsset> = {
  snow: {
    desktop: "/images/home/hero-snow.webp",
    mobile: "/images/home/hero-snow-m.webp",
    objectPosition: "center 42%",
  },
  jianghu: {
    desktop: "/images/home/hero-jianghu.webp",
    mobile: "/images/home/hero-jianghu-m.webp",
    objectPosition: "center 46%",
  },
}

/** 手机竖版的断点，与 HeroScene 里的 <source media> 保持一致 */
export const MOBILE_MEDIA = "(max-width: 767px)"

/**
 * 墨晕转场的开关属性（写在 <html> 上）。
 *
 * 为什么要开关：转场靠「选择器匹配即播动画」实现，而首屏**加载时**
 * 也会匹配一次（属性从无到 snow）—— 那会让首屏先被遮罩成空白再晕开，
 * 白白拖慢首屏可见时间。滚轮跳页前的 reset 同理，不该播。
 * 所以只在 `="on"` 时才允许播。
 */
export const HERO_INK_ATTR = "data-hero-ink"
/** 进页多久之后才允许播转场（留出首屏落定的时间） */
export const INK_ARM_DELAY_MS = 900
/**
 * 墨晕动画的时长（与 globals.css 里 hero-ink-spread 的 420ms 保持一致）。
 * 只用兜底：正常路径靠 animationend 收回开关。
 */
export const INK_RUN_MS = 420

/**
 * 首屏动态的数值表。
 *
 * 全部由**固定种子**的伪随机生成，而不是 Math.random()：
 * 随机值每次渲染都不同 → SSR 与客户端不一致，会触发水合告警。
 *
 * 参数是站长第二轮验收后定的（第一版太稀太小、且垂直下落看不出风雪）：
 * 「中等偏大 / 风从右侧来 / 中速 / 月晕明显 / 鸟明显带拍翅 / 灯火不规则忽明忽暗」。
 */

/**
 * 风向：**风从右侧吹来，雪向左飘**（站长选的这个方向）。
 * 三层（远层纹理 / 中景 / 近景）共用这一个常量，改一处整体反向。
 */
export const HERO_WIND_X = -1

export interface HeroSnowFlake {
  /** 横向位置（%，相对首屏宽） */
  x: number
  /** 直径（px） */
  size: number
  /** 下落一轮的时长（s） */
  dur: number
  /** 负延迟 = 一进页面就已经在飘了，不用等 */
  delay: number
  /** 不透明度 */
  opacity: number
  /** 落到底之前的横向漂移（px，已按风向取过符号） */
  drift: number
  /** 风摆幅度（px）：落的过程中左右晃一下，否则像"直线下坠" */
  swayAmp: number
  /** 风摆周期（s） */
  swayDur: number
  swayDelay: number
}

interface FlakeRange {
  sizeMin: number
  sizeMax: number
  durMin: number
  durMax: number
  /** 横向漂移范围（px，正值 = 向右）；实际会再乘 HERO_WIND_X */
  driftMin: number
  driftMax: number
  swayMax: number
  /** 每组用不同的种子偏移，免得两组雪点的横向分布完全重合 */
  seed: number
}

function createFlakes(count: number, range: FlakeRange): HeroSnowFlake[] {
  let seed = range.seed
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: Math.round(next() * 1000) / 10,
    size: Math.round((range.sizeMin + next() * (range.sizeMax - range.sizeMin)) * 10) / 10,
    dur: Math.round(range.durMin + next() * (range.durMax - range.durMin)),
    delay: -Math.round(next() * range.durMax),
    opacity: Math.round((0.45 + next() * 0.35) * 100) / 100,
    drift:
      HERO_WIND_X *
      Math.round(range.driftMin + next() * (range.driftMax - range.driftMin)),
    swayAmp: Math.round((0.35 + next() * 0.65) * range.swayMax),
    swayDur: Math.round((2.4 + next() * 2.2) * 10) / 10,
    swayDelay: -Math.round(next() * 40) / 10,
  }))
}

/**
 * 中景 24 个：尺寸 2.5–5px、下落 11–20s、横向漂移 300–420px。
 * 这一层负责"看得出在下雪"的密度。
 *
 * 漂移量是**故意放大**的：一屏约 880px 高，横向 300–420px 对应约 20–25° 斜落。
 * 第一版只有 120–180px（约 10°），看起来仍像直落，站长说"不像风雪"。
 */
export const HERO_SNOW_MID: HeroSnowFlake[] = createFlakes(24, {
  sizeMin: 2.5,
  sizeMax: 5,
  durMin: 11,
  durMax: 20,
  driftMin: 300,
  driftMax: 420,
  swayMax: 14,
  seed: 20261023,
})

/**
 * 近景 12 个：尺寸 5–9px、下落 8–15s、漂移 420–600px，并带一点模糊。
 * 这一层负责"体感上的大"与景深（近的大而糊、远的小而清）。
 * ⚠️ 性能不够时**第一个砍的就是这一层**（站长选的优先级）。
 */
export const HERO_SNOW_NEAR: HeroSnowFlake[] = createFlakes(12, {
  sizeMin: 5,
  sizeMax: 9,
  durMin: 8,
  durMax: 15,
  driftMin: 420,
  driftMax: 600,
  swayMax: 22,
  seed: 90210,
})

export interface HeroWindStreak {
  /** 起点纵向位置（%） */
  top: number
  /** 长度（px） */
  length: number
  /** 穿一次的时长（s） */
  dur: number
  delay: number
  opacity: number
}

/**
 * 轻风痕：6 条极淡的斜向 streaks，和雪同向（从右往左、斜向下）。
 * 只加在雪山态 —— 江湖态是雾江夜景，没有风雪。
 *
 * 第一版 4 条、1px、透明度 0.14–0.22，站长说"找不到"；
 * 这一版加到 6 条、1.6px、0.3–0.45，并把时长拉长约 20%（慢一点才像风掠，不像划痕）。
 */
export const HERO_WIND_STREAKS: HeroWindStreak[] = [
  { top: 12, length: 320, dur: 31, delay: -4, opacity: 0.32 },
  { top: 26, length: 240, dur: 38, delay: -17, opacity: 0.44 },
  { top: 41, length: 380, dur: 35, delay: -23, opacity: 0.36 },
  { top: 56, length: 280, dur: 42, delay: -11, opacity: 0.4 },
  { top: 70, length: 340, dur: 37, delay: -29, opacity: 0.3 },
  { top: 83, length: 260, dur: 45, delay: -6, opacity: 0.34 },
]

export interface HeroBird {
  /** 纵向位置（%，相对首屏高） */
  top: number
  /** 从右到左穿一次（s） */
  dur: number
  delay: number
  /** 缩放：远的鸟更小更淡 */
  scale: number
  opacity: number
}

/**
 * 江湖态的飞鸟：5 只，18–26s 穿一次（第一版 46–62s 太慢，站长说"不明显"），
 * 速度提上来之后才看得出是鸟在飞；拍翅动画在 CSS 里（`.hero-bird svg`）。
 *
 * 透明度从 0.34–0.52 提到 0.5–0.72： dusk 压暗之后，太淡的鸟在灰天空上
 * 只剩几道短横，反而像噪点。
 */
export const HERO_BIRDS: HeroBird[] = [
  { top: 19, dur: 20, delay: -3, scale: 1, opacity: 0.72 },
  { top: 23, dur: 24, delay: -11, scale: 0.82, opacity: 0.62 },
  { top: 17, dur: 26, delay: -19, scale: 0.7, opacity: 0.54 },
  { top: 27, dur: 18, delay: -7, scale: 0.9, opacity: 0.66 },
  { top: 21, dur: 22, delay: -15, scale: 0.62, opacity: 0.5 },
]


