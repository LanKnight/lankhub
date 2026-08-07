/**
 * 通过文件头（magic bytes）检测文件类型
 * 比信任客户端 file.type 更可靠
 */

type DetectedType = {
  mime: string
  ext: string
}

// 允许的图片类型（与 upload API 一致）
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

const MAGIC_PATTERNS: { bytes: number[]; mime: string; ext: string }[] = [
  // JPEG: FF D8 FF
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg", ext: "jpg" },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png", ext: "png" },
  // GIF87a / GIF89a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: "image/gif", ext: "gif" },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: "image/gif", ext: "gif" },
  // WebP: RIFF....WEBP
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp", ext: "webp" },
  // PDF: %PDF-
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], mime: "application/pdf", ext: "pdf" },
]

/**
 * 检测 buffer 的 magic bytes 并返回 MIME 类型
 * 仅在前 12 字节中检测图片和 PDF 格式
 * @returns DetectedType 或 null（无法识别）
 */
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 4) return null

  for (const pattern of MAGIC_PATTERNS) {
    if (buffer.length < pattern.bytes.length) continue
    const match = pattern.bytes.every((b, i) => buffer[i] === b)
    if (match) {
      // WebP 额外校验：偏移 8 处应为 "WEBP"
      if (pattern.mime === "image/webp") {
        if (buffer.length < 12) continue
        const webpTag = buffer.slice(8, 12).toString("ascii")
        if (webpTag !== "WEBP") continue
      }
      return { mime: pattern.mime, ext: pattern.ext }
    }
  }

  return null
}

/**
 * 检测文件是否为允许的图片格式（仅 JPG/PNG/GIF/WebP）
 */
export function isAllowedImage(buffer: Buffer): DetectedType | null {
  const detected = detectFileType(buffer)
  if (!detected) return null
  if (ALLOWED_IMAGE_MIMES.includes(detected.mime)) return detected
  return null
}

/**
 * 检测文件是否为 PDF
 */
export function isPdf(buffer: Buffer): boolean {
  const detected = detectFileType(buffer)
  return detected?.mime === "application/pdf"
}
