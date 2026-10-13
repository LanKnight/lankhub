/**
 * Resend 邮件发送 —— **仅服务端**。
 *
 * 没有写 `import "server-only"`：那个包本项目并未安装，
 * 为了一行 import 引入一个新依赖不划算。
 * 这里的安全性来自机制本身：模块读取 `process.env.RESEND_API_KEY`，
 * 而 Next.js **只把 `NEXT_PUBLIC_` 前缀的变量内联到客户端**，
 * 所以这个模块不可能被客户端组件用起来还拿到 Key（会直接拿到 undefined）。
 *
 * 为什么**不用** resend 官方 SDK 而是直接 fetch：
 * 报文就是一个 POST JSON，SDK 只多一层包装与传递依赖；
 * 开源仓库少一个依赖就少一份维护面。
 *
 * 为什么在函数里读环境变量、而不是模块级缓存成常量：
 * 改 `.env` 后 `pm2 restart` 就能生效，也避免导入期因为缺 Key 抛异常
 * （缺 Key 应当由接口返回明确文案，而不是让整个应用起不来）。
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

/**
 * 实际使用的端点。允许用 `RESEND_API_BASE` 覆盖，**默认仍是真实 Resend**。
 *
 * 为什么留这个开关：验证码逻辑（限流、有效期、用后即焚、错误次数）需要
 * 反复跑测试，每次真的发一封邮件既慢又消耗免费额度（100 封/天）。
 * 有了它，测试可以指向本地 mock 服务，既快又不花额度。
 *
 * 注意它**不是**给生产用的：正式部署不要设这个变量，
 * 否则验证码邮件会被发到一个错误的地方（甚至泄露验证码）。
 */
function endpoint(): string {
  const base = process.env.RESEND_API_BASE?.trim()
  return base ? `${base.replace(/\/+$/, "")}/emails` : RESEND_ENDPOINT
}

/**
 * 发送超时。
 *
 * 必须设：Resend 若卡住而我们不设超时，请求会一直挂着占住 Node 的句柄。
 * 8 秒对一封验证码邮件足够宽松。
 */
const TIMEOUT_MS = 8000

/** 邮件功能的总开关。默认开启；`EMAIL_ENABLED=false` 时所有发信直接拒绝 */
export function isEmailEnabled(): boolean {
  // 只有明确写成 "false" 才算关闭，避免 "0" / "" / 拼错时意外关掉功能
  return (process.env.EMAIL_ENABLED ?? "true").toLowerCase() !== "false"
}

export function getEmailApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim()
  return key ? key : null
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "noreply@lankhub.xyz"
}

export function getSiteName(): string {
  return process.env.EMAIL_SITE_NAME?.trim() || "lankHub"
}

/**
 * 日志用的 Key 指纹：**只回长度**，不回任何字符。
 *
 * ⚠️ 这里刻意不打印前缀。之前本站就因为文档里写了 Key 的前 8 个字符
 * 而被迫吊销重发（见 docs/emailAuthDevDoc.md 第 1.4 节），不要再犯。
 * 长度足以判断「有没有配」「是不是被截断」。
 */
export function apiKeyFingerprint(): string {
  const key = getEmailApiKey()
  if (!key) return "未配置"
  return `已配置（长度 ${key.length}）`
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; /** HTTP 状态码，网络层失败为 null */ status: number | null }

/**
 * 发送一封邮件。
 *
 * 返回结构化结果而不是抛异常：调用方（发码接口）需要根据失败原因
 * 给出**不同**的用户文案 —— 例如「邮件服务未配置」和「发送过于频繁」
 * 对用户是两件事，混成一句「发送失败」会让人无从排查。
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    return { ok: false, error: "邮件功能已关闭", status: null }
  }

  const key = getEmailApiKey()
  if (!key) {
    // 这是最可能的线上故障：PM2 进程没读到环境变量。
    // 文案里明确写出来，免得又被当成「Resend 拒绝」去排查半天。
    return { ok: false, error: "邮件服务未配置（缺少 RESEND_API_KEY）", status: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      /*
       * 把 Resend 的原始错误读出来再翻译。
       * 常见三种：
       *   401 → Key 无效/已吊销（我们这边配置问题）
       *   403 → 域名未验证，或 from 不属于已验证域名
       *   429 → 额度或频率超限
       * 不把原始 body 直接回给前端（可能含内部信息），只进服务端日志。
       */
      const body = await res.text().catch(() => "")
      console.error(
        `[email] Resend 返回 ${res.status}（key ${apiKeyFingerprint()}）：${body.slice(0, 500)}`
      )
      return { ok: false, error: explainStatus(res.status), status: res.status }
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    // AbortError 说明是我们自己的超时，与网络错误区分开，便于排查
    const aborted = err instanceof Error && err.name === "AbortError"
    console.error("[email] 发送失败：", aborted ? `超时（${TIMEOUT_MS}ms）` : err)
    return {
      ok: false,
      error: aborted ? "邮件服务响应超时" : "邮件服务连接失败",
      status: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 把 Resend 的状态码翻译成能让人看懂、且不泄露内部信息的中文 */
function explainStatus(status: number): string {
  switch (status) {
    case 401:
      return "邮件服务鉴权失败（API Key 无效或已吊销）"
    case 403:
      return "发件域名未通过验证，或发件地址不属于已验证域名"
    case 422:
      return "邮件参数被拒绝（请检查发件地址）"
    case 429:
      return "邮件服务限流，请稍后再试"
    default:
      return status >= 500 ? "邮件服务暂时不可用" : "邮件发送失败"
  }
}
