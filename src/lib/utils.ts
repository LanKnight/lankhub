import slugifyLib from "slugify"

export function generateSlug(title: string): string {
  return slugifyLib(title, {
    lower: true,
    strict: true,
    locale: "zh",
  })
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
