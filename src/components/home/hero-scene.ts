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
 * 为什么要它：悬停范围是整块首屏，而鼠标进页面时通常就落在首屏里 ——
 * 没有宽限的话一进来就切到江湖态，雪山态几乎永远看不到。
 */
export const HOVER_GRACE_MS = 1200

/** 指针停留多久才切（防误触）。离开立即恢复，恢复侧不加延迟 */
export const HOVER_DWELL_MS = 300

/**
 * 首屏显示字体（标题 / 箴言 / 印章）。
 *
 * 中文只带用得上的字：
 * - 三款候选都是从 Google Fonts 按字子集下来自托管的（CSP 是 default-src 'self'）
 * - 子集后每个只有 10-17KB，全量中文字体是 5-10MB，不可能整包带
 *
 * `base` = 不动（沿用全站宋体栈），其余为候选。
 * 阶段 2 用 `?font=` 切换对比；选定后把默认值改成它，并删掉其余与这段开关。
 */
export const HERO_FONT_CANDIDATES = ["base", "noto900", "brush", "xingshu"] as const
export type HeroFontCandidate = (typeof HERO_FONT_CANDIDATES)[number]

/** 当前默认：站长选好之后改成对应候选 */
export const HERO_FONT_DEFAULT: HeroFontCandidate = "base"

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
