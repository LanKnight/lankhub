/**
 * 基于内存的滑动窗口限流器（适合单机 PM2 部署）
 * PM2 重启后计数清零，对用户体验影响小
 */

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * 登录限流阈值，auth.ts（真正拦截）与 auth-actions.ts（给友好提示）共用同一组数字。
 *
 * 两道都要有：
 *  - 按「邮箱+IP」防针对同一账号的暴力破解
 *  - 按「IP」防同一来源换不同邮箱撞库 —— 只有第一道的话，换个邮箱就绕过了
 */
export const LOGIN_ACCOUNT_MAX = 5
export const LOGIN_IP_MAX = 30
export const LOGIN_WINDOW_MS = 60 * 1000

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
 * 只看当前窗口是否已超限，**不增加计数**。
 *
 * 用于在真正调用限流器之前给出友好提示：authorize 里被限流只会返回 null，
 * 到前端就变成「邮箱或密码错误」，用户根本看不出自己是被限流了。
 *
 * 这里绝不能用 rateLimit() 代替 —— 那会和 authorize 里的那次重复计数，
 * 相当于把阈值砍了一半。
 */
export function peekRateLimit(
  key: string,
  maxRequests: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  maybeCleanup()

  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || now > entry.resetAt) {
    return { allowed: true }
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { allowed: true }
}

/**
 * 从请求头里提取客户端 IP
 * 优先使用 Nginx 转发的 X-Forwarded-For，fallback 到直连 IP
 *
 * 收 `Headers` 而不是 `Request`：这样 Server Action 里通过 next/headers 拿到的
 * headers() 也能复用同一套解析逻辑，不必再伪造一个 Request。
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    // X-Forwarded-For 可能包含多个 IP（逗号分隔），取第一个
    return forwarded.split(",")[0].trim()
  }
  // Fallback: 直连 IP（开发环境或无 Nginx 场景）
  return "127.0.0.1"
}
