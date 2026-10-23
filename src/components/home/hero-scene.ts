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
