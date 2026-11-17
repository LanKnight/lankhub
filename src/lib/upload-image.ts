import {
  COMPRESS_PRESETS,
  compressImage,
  formatBytes,
  toUploadFile,
  type CompressPresetName,
} from "./image-compress"
import { uploadWithProgress } from "./upload"

export interface UploadedImage {
  url: string
  /** 压缩后的实际宽高（前台排版用它预留比例，避免加载跳动） */
  width: number
  height: number
  /** 压缩后的字节数 */
  bytes: number
  /** 原图字节数 */
  originalBytes: number
  /** 压缩后被跳过的原因（小图/动图不压） */
  skipped: boolean
}

/** 反向代理的请求体上限约 1MB，留一点余量 */
const UPLOAD_SAFE_LIMIT = 1020 * 1024

/**
 * 压缩后上传一张图片（浏览器端）。
 *
 * 为什么做成一个函数：编辑器插图、简历头像、动态配图原来是三份各自实现的
 * 「压缩 → 组装 FormData → 上传 → 取尺寸」，加一个档位要改三处。
 *
 * 失败时抛错，message 直接可展示给用户（不抛底层异常文本）。
 */
export async function uploadImageCompressed(
  file: File,
  preset: CompressPresetName,
  options: { onProgress?: (percent: number) => void } = {}
): Promise<UploadedImage> {
  const result = await compressImage(file, COMPRESS_PRESETS[preset])

  if (result.size > UPLOAD_SAFE_LIMIT) {
    throw new Error(
      `「${file.name}」压缩后仍有 ${formatBytes(result.size)}，超过上传上限，请换一张小一点的图`
    )
  }

  const upload = toUploadFile(result, file.name)
  const formData = new FormData()
  formData.append("file", upload)

  const res = await uploadWithProgress("/api/upload", formData, (percent) =>
    options.onProgress?.(percent)
  )
  const data = await res.json().catch(() => null)

  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "图片上传失败")
  }

  return {
    url: data.url as string,
    width: result.width,
    height: result.height,
    bytes: result.size,
    originalBytes: result.originalSize,
    skipped: result.skipped,
  }
}
