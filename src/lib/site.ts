/**
 * 站点对外地址的**单一来源**。
 *
 * 为什么要有这个文件：以前 sitemap.ts 与 robots.ts 各自写了一份
 * `process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"`，
 * 而 layout 的 metadata 又没有 metadataBase —— 结果线上 sitemap 里 29 条网址
 * 全是 `http://localhost:3000`，robots.txt 把搜索引擎指向 localhost，
 * 分享卡片的 og:image 也解析成了 localhost（外部访问不到，等于没有图）。
 *
 * 三条规则：
 *  1. 只在这里拼一次，其他地方一律 import，避免三份兜底各自漂移
 *  2. **生产环境绝不接受 localhost**：万一环境变量漏配，退回上面的正式域名并告警，
 *     而不是安静地生成一堆 localhost 网址（那种错误只有抓线上页面才能发现）
 *  3. 末尾斜杠统一去掉，免得拼出 `https://x.com//blog` 这种双斜杠
 */

/** 兜底用的正式域名。改域名时这里和 .env.example 一起改 */
const CANONICAL_URL = "https://www.lankhub.xyz"

function normalize(raw: string): string {
  return raw.trim().replace(/\/+$/, "")
}

function resolveSiteUrl(): string {
  const configured = normalize(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || ""
  )

  const looksLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(configured)

  // 开发环境用 localhost 是正常的；生产环境出现 localhost 一定是漏配
  if (!configured) {
    // 没配也没关系：生产用正式域名，开发用 localhost（两者都不会"安静地错")
    return process.env.NODE_ENV === "production" ? CANONICAL_URL : "http://localhost:3000"
  }
  if (looksLocal) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[site] 站点地址被配成了 ${configured}，生产环境不接受，已退回 ${CANONICAL_URL}。` +
          "请检查服务器 .env.local 里的 NEXT_PUBLIC_SITE_URL。"
      )
      return CANONICAL_URL
    }
    return configured
  }
  return configured
}

export const SITE_URL = resolveSiteUrl()
