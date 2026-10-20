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
 * 从请求头里提取客户端 IP。
 *
 * ## ⚠️⚠️ 这里取的是「最右」而不是「最左」，这是安全修复
 *
 * 原先取 `X-Forwarded-For` 的**第一个**值，而 Nginx 用的是
 * `$proxy_add_x_forwarded_for` —— 它会把**客户端自带的值保留、再把真实 IP 追加在后面**。
 * 于是「第一个值」完全由客户端控制：
 *
 * ```bash
 * curl -H "X-Forwarded-For: 1.2.3.4" ...   # 每次换一个假 IP
 * ```
 *
 * 后果不是理论上的：所有基于 IP 的限流全部失效 ——
 *  - `/api/auth/send-code` 的 IP 日限被绕过 → 能无限刷发码，
 *    把 Resend 的免费额度（100 封/天）烧光，**之后站长自己也发不出验证码**
 *  - 登录的 IP 限流被绕过 → 可以无上限暴力破解
 *
 * 正确的取值方向取决于「可信代理有几层」：
 *  - 请求从外到内经过 N 层可信代理，每层都会把自己的对端追加到末尾，
 *    所以**倒数第 N 个**才是真实客户端
 *  - 本文的项目部署是「Nginx → Next.js」一层，所以取**最后一个**
 *
 * ## 前提（将来改部署时必须同步改这里）
 *
 * 这个函数假设**只经过一层可信代理**，且那层会追加（而不是覆盖）XFF。
 * 若以后加了 CDN 或负载均衡，链会变长，必须把 `TRUSTED_PROXY_HOPS` 改成实际层数，
 * 否则会把 CDN 的地址当成客户端 IP —— 那样所有人共用同一个 IP 桶，
 * 限流会变成「全站共用一个额度」。
 *
 * 阅读这块时另注意：Nginx 那边也可以选择**直接覆盖** XFF
 * （`proxy_set_header X-Forwarded-For $remote_addr;`），那样「最左」也是可信的。
 * 但应用侧不应该依赖 Nginx 的具体写法 —— 两处都做才是纵深防御。
 */

/** 可信代理层数。当前部署是「Nginx → Next.js」一层 */
const TRUSTED_PROXY_HOPS = 1

/** 粗校验：IPv4 / IPv6 / 带端口。不合法的值一律不用，避免把垃圾写进限流键 */
function looksLikeIp(value: string): boolean {
  const v = value.trim()
  if (v.length === 0 || v.length > 64) return false
  // IPv4（可带端口）
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(v)) return true
  // IPv6（粗判：只允许十六进制与冒号，可带方括号）
  if (/^\[?[0-9a-fA-F:]{2,}\]?(:\d+)?$/.test(v)) return true
  return false
}


/**
 * 只警告一次，避免每个请求都刷日志。
 *
 * 定义在使用它的 getClientIp 之前（`let` 虽然会提升，但引用在声明之前
 * 属于暂时性死区，依赖「运行时恰好还没调用」太脆弱）。
 */
let warnedMissingIp = false

export function getClientIp(headers: Headers): string {
  /*
   * 优先 X-Forwarded-For：按可信代理层数从**右往左**取。
   *
   * 为什么优先它而不是 X-Real-IP：XFF 是标准头、各种代理都会维护；
   * 而 X-Real-IP 是非标准的，某些部署根本不会设。
   */
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (parts.length > 0) {
      // 倒数第 TRUSTED_PROXY_HOPS 个：跳过我们自己的代理写入的那一段
      const index = parts.length - TRUSTED_PROXY_HOPS
      const candidate = parts[index >= 0 ? index : 0]
      if (looksLikeIp(candidate)) return candidate
    }
  }

  /*
   * 退回 X-Real-IP（Nginx 用 $remote_addr 无条件写入，客户端改不了它）。
   * 宁可多读一个头，也不要因为 XFF 形状异常就退回一个共享的默认值 ——
   * 那样所有请求会挤进同一个限流桶，限流形同虚设。
   */
  const realIp = headers.get("x-real-ip")
  if (realIp && looksLikeIp(realIp)) return realIp.trim()

  /*
   * 最后才退回直连地址。
   *
   * 这个兜底值意味着「拿不到可用的真实 IP」，此时所有请求共用同一个限流桶 ——
   * 限流仍然生效（只是粒度粗），比放行安全。
   * 它可能有两种原因，值得在日志里区分，所以把原始头打出来（每进程只打一次）：
   *   1. 部署少了代理层（两个头都没设）
   *   2. 头在，但形状不是 IP（可能是被上游塞了奇怪的东西）
   */
  if (!warnedMissingIp) {
    warnedMissingIp = true
    console.warn(
      "[rate-limit] 拿不到可用的客户端 IP，所有请求会共用同一个限流桶。" +
        ` 原始头：x-forwarded-for=${JSON.stringify(forwarded)} x-real-ip=${JSON.stringify(realIp)}。` +
        " 若这是生产环境，请检查 Nginx 是否设置了这两个头。"
    )
  }
  return "127.0.0.1"
}

