/**
 * 浏览器端图片压缩（无依赖，Canvas/OffscreenCanvas + WebP）
 * ------------------------------------------------------------------
 * 为什么必须放在浏览器做：
 * 反向代理的请求体上限约 1MB（实测 1024KB 能进应用、1100KB 直接被 nginx 挡成 413），
 * **大图根本到不了服务器**，服务端压缩没有机会执行。只有先在本地压小再上传才可行。
 *
 * 为什么"无损"不够：
 * 实测 WebP 无损只能省 34–35%，5MB 的照片压完还有 3MB+，照样 413。
 * 所以这里走"视觉无损"：默认长边 2560 + WebP q0.82（实测 PSNR 约 39–42dB）。
 *
 * 两个刻意的行为：
 * 1. **小图不碰**：体积已达标且尺寸不超过上限时原样返回（`skipped: true`）。
 *    否则一张 200KB 的图重编码后可能反而变大。
 * 2. **动图不碰**：GIF 用 canvas 重编码会只剩第一帧，直接跳过压缩。
 */

/** 各用途的默认档位：相册要更大的长边，封面按前台展示尺寸给 */
export const COMPRESS_PRESETS = {
  /** 文章/合集封面：前台展示宽度约 900px，2 倍屏下 1880 足够 */
  cover: { maxEdge: 1880, quality: 0.82, targetBytes: 900 * 1024 },
  /** 相册照片：lightbox 会放大看，长边 2560 */
  photo: { maxEdge: 2560, quality: 0.82, targetBytes: 900 * 1024 },
} as const

export type CompressPresetName = keyof typeof COMPRESS_PRESETS

export interface CompressOptions {
  /** 长边上限（只在超过时缩放） */
  maxEdge: number
  /** WebP 质量 0–1 */
  quality: number
  /** 目标体积上限（字节）。超出则自动降质量/降尺寸 */
  targetBytes: number
  /** 阶梯降级时允许的最小长边 */
  minEdge?: number
}

export interface CompressAttempt {
  quality: number
  maxEdge: number
  size: number
}

export interface CompressResult {
  /** 用于上传的 blob */
  blob: Blob
  width: number
  height: number
  /** 原始文件体积 */
  originalSize: number
  /** 压缩后体积 */
  size: number
  /** 实际编码格式（通常是 image/webp；浏览器不支持时会退回 image/jpeg） */
  format: string
  quality: number
  maxEdge: number
  /** 真正生效的目标体积 */
  targetBytes: number
  /** 是否原样返回（小图 / 动图 / 已达标） */
  skipped: boolean
  /** 跳过原因，用于界面提示 */
  skipReason?: "small-enough" | "animated" | "unsupported"
  /** 每次尝试的体积，便于说明"为什么压到这个质量" */
  attempts: CompressAttempt[]
}

/** 界面上的体积文案：1536 → "1.5 KB"，1536000 → "1.5 MB" */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function isAnimatedOrUntouchable(file: File): boolean {
  // GIF：canvas 只能取第一帧，压缩等于毁掉动图
  return file.type === "image/gif"
}

interface Decoded {
  bitmap: ImageBitmap
  width: number
  height: number
  dispose: () => void
}

/** 解码 + 按 EXIF 摆正（imageOrientation），必要时顺便让浏览器缩放到目标尺寸 */
async function decode(file: File, targetEdge: number): Promise<Decoded> {
  const probe = await createImageBitmap(file)
  const w = probe.width
  const h = probe.height
  const longEdge = Math.max(w, h)
  const scale = longEdge > targetEdge ? targetEdge / longEdge : 1

  if (scale < 1) {
    // 让浏览器在解码阶段就缩好：比"解码全尺寸再画到小 canvas"省内存、质量也更好
    probe.close()
    const resized = await createImageBitmap(file, {
      resizeWidth: Math.max(1, Math.round(w * scale)),
      resizeHeight: Math.max(1, Math.round(h * scale)),
      resizeQuality: "high",
    })
    return {
      bitmap: resized,
      width: resized.width,
      height: resized.height,
      dispose: () => resized.close(),
    }
  }

  return { bitmap: probe, width: w, height: h, dispose: () => probe.close() }
}

/** 把 bitmap 画到 canvas 并编码成 WebP；浏览器不支持 WebP 时退回 JPEG */
async function encode(
  bitmap: ImageBitmap,
  quality: number
): Promise<{ blob: Blob; format: string }> {
  const width = bitmap.width
  const height = bitmap.height

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("无法创建画布上下文")
    ctx.drawImage(bitmap, 0, 0, width, height)
    let blob = await canvas.convertToBlob({ type: "image/webp", quality })
    let format = "image/webp"
    // 个别浏览器会"接受" image/webp 却产出 PNG —— 体积反而更大，退回 JPEG
    if (blob.type !== "image/webp") {
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality })
      format = "image/jpeg"
    }
    return { blob, format }
  }

  // 老浏览器回退：普通 canvas + toBlob
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("无法创建画布上下文")
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality)
  )
  if (!blob) throw new Error("编码失败")
  return { blob, format: blob.type || "image/webp" }
}

/**
 * 压缩一张图。
 *
 * 阶梯策略（直到体积 ≤ targetBytes 或降到底线）：
 *   1. 先在 maxEdge + quality 下编码
 *   2. 还大：质量每次 −0.08，最低到 0.6
 *   3. 还大：长边每次 ×0.85，最低到 minEdge（默认 1280）
 *   4. 仍超限：返回目前最小的那一版（界面会提示实际体积）
 *
 * 只保留最小的一次结果，不会出现"越压越大"。
 */
export async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
  const targetBytes = options.targetBytes
  const minEdge = options.minEdge ?? 1280

  const base: Omit<CompressResult, "blob" | "width" | "height" | "size" | "quality" | "maxEdge" | "format" | "attempts" | "skipped" | "skipReason"> = {
    originalSize: file.size,
    targetBytes,
  }

  // 动图原样返回（会被后续的 1MB 检查兜住，提示用户手动处理）
  if (isAnimatedOrUntouchable(file)) {
    const probe = await createImageBitmap(file)
    const width = probe.width
    const height = probe.height
    probe.close()
    return {
      ...base,
      blob: file,
      width,
      height,
      size: file.size,
      quality: 1,
      maxEdge: Math.max(width, height),
      format: file.type,
      attempts: [],
      skipped: true,
      skipReason: "animated",
    }
  }

  // 先探一次尺寸：已经够小、且尺寸不超上限时，原样上传（避免把好图压坏或压大）
  const probe = await createImageBitmap(file)
  const probeW = probe.width
  const probeH = probe.height
  probe.close()
  const longEdge = Math.max(probeW, probeH)
  if (file.size <= targetBytes && longEdge <= options.maxEdge) {
    return {
      ...base,
      blob: file,
      width: probeW,
      height: probeH,
      size: file.size,
      quality: 1,
      maxEdge: longEdge,
      format: file.type,
      attempts: [],
      skipped: true,
      skipReason: "small-enough",
    }
  }

  const attempts: CompressAttempt[] = []
  let best: { blob: Blob; format: string; width: number; height: number; quality: number; edge: number } | null =
    null

  let quality = options.quality
  let edge = options.maxEdge

  for (let step = 0; step < 12; step += 1) {
    const decoded = await decode(file, edge)
    try {
      const { blob, format } = await encode(decoded.bitmap, quality)
      attempts.push({ quality, maxEdge: edge, size: blob.size })

      if (!best || blob.size < best.blob.size) {
        best = {
          blob,
          format,
          width: decoded.width,
          height: decoded.height,
          quality,
          edge,
        }
      }

      if (blob.size <= targetBytes) break

      // 先降质量，质量到底了再降尺寸
      if (quality > 0.6 + 1e-6) {
        quality = Math.max(0.6, Math.round((quality - 0.08) * 100) / 100)
      } else if (edge > minEdge) {
        edge = Math.max(minEdge, Math.round(edge * 0.85))
      } else {
        break
      }
    } finally {
      decoded.dispose()
    }
  }

  if (!best) throw new Error("压缩失败：没有产生任何结果")

  return {
    ...base,
    blob: best.blob,
    width: best.width,
    height: best.height,
    size: best.blob.size,
    quality: best.quality,
    maxEdge: best.edge,
    format: best.format,
    attempts,
    skipped: false,
  }
}

/** 把压缩结果包成 File，便于沿用现有上传逻辑（文件名改成 .webp/.jpg） */
export function toUploadFile(result: CompressResult, originalName: string): File {
  const ext = result.format === "image/webp" ? "webp" : result.format === "image/png" ? "png" : "jpg"
  const base = originalName.replace(/\.[^.]+$/, "") || "image"
  return new File([result.blob], `${base}.${ext}`, { type: result.format })
}
