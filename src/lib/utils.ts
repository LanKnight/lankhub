import slugifyLib from "slugify"

export function generateSlug(title: string): string {
  const slug = slugifyLib(title, {
    lower: true,
    strict: true,
    locale: "zh",
  })
  // Fallback for titles that produce empty slugs (e.g., pure Chinese characters)
  if (!slug) {
    return `post-${Date.now()}`
  }
  return slug
}

/**
 * 安全 URL 检查：仅允许 http、https、mailto 和相对路径
 * 阻断 javascript:、data:、vbscript: 等危险协议
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false
  // 相对路径或锚链接（以 / 或 # 开头，但拒绝 // 协议相对 URL）
  if (url.startsWith("#")) return true
  if (url.startsWith("/") && !url.startsWith("//")) return true
  try {
    const parsed = new URL(url, "http://local")
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function formatDate(date: Date | string, format: string = "YYYY-MM-DD"): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")

  if (format === "YYYY-MM-DD HH:mm") {
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  return `${year}-${month}-${day}`
}

export function estimateReadTime(content: string): number {
  // Rough estimate: 300 Chinese characters per minute
  const textLength = content.replace(/<[^>]*>/g, "").length
  return Math.max(1, Math.ceil(textLength / 300))
}
