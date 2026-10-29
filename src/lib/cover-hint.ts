/**
 * 封面比例：全站统一 2.35:1（宽银幕），与站长常用素材一致。
 *
 * 为什么要把"建议"和"裁切损失"算给用户看：
 * 封面槽位是固定比例的容器 + `object-cover`，任何非 2.35:1 的图都会被居中裁切。
 * 以前这个损失是**看不见的** —— 传一张 1:1 的图，前台只露出中间一条，人却不知道裁了多少。
 * 现在在后台选完图就把"当前多少比、会裁掉多少"直接写出来。
 */

/** 封面容器的宽高比：47/20 = 2.35 */
export const COVER_ASPECT = 47 / 20

/** 后台提示的推荐像素（2.35:1，且足够 2 倍屏下 940px 宽的卡片） */
export const COVER_SUGGEST = "建议 1880 × 800（2.35:1）"

export interface CoverRatioHint {
  /** ok = 基本不会被裁；warn = 会裁掉一块 */
  level: "ok" | "warn"
  text: string
}

/**
 * 把一张图的宽高比换算成"人话"。
 *
 * @param width  原图宽（px）
 * @param height 原图高（px）
 */
export function describeCoverRatio(width: number, height: number): CoverRatioHint | null {
  if (!width || !height) return null

  const ratio = width / height
  const shown = ratio.toFixed(2)

  // 比容器更宽 → 左右被裁；更窄 → 上下被裁
  if (ratio >= COVER_ASPECT) {
    const lost = 1 - COVER_ASPECT / ratio
    const percent = Math.round(lost * 100)
    if (percent <= 2) {
      return { level: "ok", text: `当前 ${shown}:1，与封面比例一致，几乎不会被裁切` }
    }
    return {
      level: "warn",
      text: `当前 ${shown}:1，比封面更宽：左右两侧共裁掉约 ${percent}% 宽度（各 ${Math.round(lost * 50)}%）`,
    }
  }

  const lost = 1 - ratio / COVER_ASPECT
  const percent = Math.round(lost * 100)
  return {
    level: "warn",
    text: `当前 ${shown}:1，比封面更高：上下两侧共裁掉约 ${percent}% 高度（各 ${Math.round(lost * 50)}%）`,
  }
}

/**
 * 从 File 读宽高。用 createImageBitmap，不需要造 objectURL、也不会泄漏引用。
 * 万一环境不支持（老 Safari），退回 <img> + objectURL。
 */
export async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return size
  } catch {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        resolve(null)
        URL.revokeObjectURL(url)
      }
      img.src = url
    })
  }
}
