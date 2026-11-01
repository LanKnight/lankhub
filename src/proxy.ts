import { NextRequest, NextResponse } from "next/server"

/**
 * 只对**后台**（/admin/*）下发带 nonce 的 CSP。
 *
 * 为什么不覆盖全站：Next 官方明确要求 nonce 必须配合**动态渲染** ——
 * 静态预渲染的页面会在构建时把 nonce 写死，请求时对不上，那些页面的脚本会被 CSP 拦掉。
 * 本站的 /resume、/disclaimer、/music/disclaimer、/auth/login 都是静态页，
 * 为了它们把渲染方式全改掉，代价远大于收益。
 *
 * 而后台页都要读 session（`getCurrentUser()` → cookie），本来就是动态渲染，
 * 天然满足前提；同时"管理端 XSS = 站长会话被接管"正是最值钱的防护目标。
 *
 * 注意：next.config.ts 里的 CSP 已经把 /admin 排除掉了，
 * 否则同一响应会带两个 CSP 头，浏览器按**交集**执行，容易出难查的怪问题。
 */
export function proxy(request: NextRequest) {
  /*
   * nonce 必须每次请求都不一样且不可预测。
   * 用 btoa 而不是 Buffer：proxy 在 Edge 运行时里没有 Buffer。
   */
  const nonce = btoa(crypto.randomUUID())

  const csp = [
    "default-src 'self'",
    /*
     * `'strict-dynamic'` 让 Next 动态插入的分包脚本自动继承信任（它们带 nonce），
     * 同时让 `'unsafe-inline'` 在支持 CSP3 的浏览器里失效 —— 这正是我们要的效果。
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // TipTap / Tailwind 依赖内联样式；样式注入的危害远低于脚本，保留
    "style-src 'self' 'unsafe-inline'",
    // 后台封面预览可能回显本站图片与 blob
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  // 交给 Next 读取：它会把同一个 nonce 加到自己的脚本标签上
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

/** 只匹配后台；公开页面继续用 next.config.ts 里那份（不含 nonce） */
export const config = {
  matcher: ["/admin/:path*"],
}
