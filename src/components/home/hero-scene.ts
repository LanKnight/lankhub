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
 * 首屏动态（阶段 A）的数值表。
 *
 * 全部**写死**、不用随机：
 * - 随机值每帧/每次渲染都可能变，看起来像抖动；而且 SSR 与客户端不一致会触发水合告警。
 * - 节奏取「克制」：雪 20–39s 一轮、鸟 46–62s 穿一次，符合水墨的呼吸感。
 */
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
  /** 落到底之前横向漂移（px，正右负左） */
  drift: number
}

/**
 * 雪点用**固定种子**的伪随机生成，而不是 Math.random()：
 * - 随机值每次渲染都不同 → SSR 与客户端不一致，会触发水合告警；
 * - 写死 20 行太啰嗦，改数量/尺寸时也不好维护。
 * 固定种子保证**每次构建结果完全一致**。
 */
function createFlakes(count: number): HeroSnowFlake[] {
  let seed = 20261023
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  return Array.from({ length: count }, () => ({
    x: Math.round(next() * 1000) / 10,
    size: Math.round((1.8 + next() * 2.2) * 10) / 10,
    dur: Math.round(20 + next() * 19),
    delay: -Math.round(next() * 38),
    opacity: Math.round((0.45 + next() * 0.35) * 100) / 100,
    drift: Math.round((next() - 0.5) * 56),
  }))
}

/**
 * 20 个，靠**颜色对比**而不是数量让雪可见。
 *
 * 站长验收第一版时指出：「雪不可见可能是与原图背景颜色太一样，
 * 优先把雪改灰一点点，而不是加量」——所以雪点是冷灰本体（见 CSS），
 * 数量维持克制档。
 */
export const HERO_SNOW_FLAKES: HeroSnowFlake[] = createFlakes(20)



export interface HeroBird {
  /** 纵向位置（%，相对首屏高） */
  top: number
  /** 从左到右穿一次（s） */
  dur: number
  delay: number
  /** 缩放：远的鸟更小更淡 */
  scale: number
  opacity: number
}

/** 江湖态的飞鸟：呼应参考图里那几只归鸟，速度很慢，不抢戏 */
export const HERO_BIRDS: HeroBird[] = [
  { top: 21, dur: 46, delay: -6, scale: 1, opacity: 0.5 },
  { top: 26, dur: 54, delay: -22, scale: 0.78, opacity: 0.4 },
  { top: 18, dur: 62, delay: -38, scale: 0.66, opacity: 0.34 },
]

