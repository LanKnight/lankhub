/**
 * 基于内存的滑动窗口限流器（适合单机 PM2 部署）
 * PM2 重启后计数清零，对用户体验影响小
 */

const buckets = new Map<string, { count: number; resetAt: number }>()

// 定期清理过期条目，防止 Map 无限增长
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60_000 // 每分钟清理一次

function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) {
      buckets.delete(key)
    }
  }
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  maybeCleanup()

  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true }
}

/**
 * 从请求中提取客户端 IP
 * 优先使用 Nginx 转发的 X-Forwarded-For，fallback 到直连 IP
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    // X-Forwarded-For 可能包含多个 IP（逗号分隔），取第一个
    return forwarded.split(",")[0].trim()
  }
  // Fallback: 直连 IP（开发环境或无 Nginx 场景）
  return "127.0.0.1"
}
