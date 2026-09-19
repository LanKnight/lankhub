import slugifyLib from "slugify"

/** 带页码的列表地址：第 1 页省略 query，保持 URL 干净 */
export function pagedHref(base: string, page: number): string {
  return page > 1 ? `${base}?page=${page}` : base
}

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

/** 相对时间："刚刚 / x 分钟前 / x 小时前 / x 天前 / 具体日期" */
export function timeAgo(date: Date | string): string {
  const d = new Date(date)
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`

  return formatDate(d)
}

export function estimateReadTime(content: string): number {
  // content 是 TipTap JSON 字符串，解析后提取纯文本再计数
  let textLength = 0
  try {
    const parsed = JSON.parse(content)
    textLength = countTextLength(parsed)
  } catch {
    // 非 JSON 内容（兼容旧数据）按原始长度估算
    textLength = content.replace(/<[^>]*>/g, "").length
  }
  // Rough estimate: 300 Chinese characters per minute
  return Math.max(1, Math.ceil(textLength / 300))
}

/** 递归统计 TipTap 文档节点中的纯文本长度 */
function countTextLength(node: any): number {
  if (!node || typeof node !== "object") return 0
  if (typeof node.text === "string") return node.text.length
  if (Array.isArray(node.content)) {
    return node.content.reduce(
      (sum: number, child: any) => sum + countTextLength(child),
      0
    )
  }
  return 0
}
