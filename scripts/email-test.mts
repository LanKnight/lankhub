/**
 * 手动发送一封测试邮件，用于验证「服务器上到底发不发得出去」。
 *
 * 用法（在项目根目录执行）：
 *   npx tsx scripts/email-test.mts 你的邮箱@example.com
 *
 * 它复用应用里同一套发送逻辑（src/lib/email/sender.ts 与 templates.ts），
 * 因此这里通了，就等于应用的发送链路通了。
 *
 * 为什么要有它：
 *   - /api/auth/email-health 只能证明「Key 读到了」，不能证明「Resend 真的接受」
 *   - 真实验证要发一封真邮件，而那个动作不该暴露成公开 HTTP 接口
 *     （否则任何人都能拿你邮箱刷额度）
 *   所以做成一个需要服务器访问权限才能跑的命令行脚本。
 *
 * 两个实现上的坑，改这个文件前先看：
 *
 * 1. 扩展名是 .mts 而不是 .ts
 *    tsconfig 的 include 含 ** / *.ts，scripts 下的 .ts 会被 next build 的
 *    类型检查扫到。本脚本用了顶层 await，在 CommonJS 语义下会报错并导致
 *    build 失败；.mts 明确是 ESM，规避之。
 *
 * 2. 环境变量必须在动态 import 之前加载
 *    ES 模块的静态 import 会被提升到文件顶部执行，所以
 *    「先 dotenvConfig() 再静态 import sender」这种写法是无效的 ——
 *    sender 模块会在 dotenv 之前就被求值。下面因此用 await import()。
 *    （项目里 prisma 下的脚本是同样的静态 import 写法，只是它们恰好没用到
 *      需要提前加载的环境变量，所以没暴露这个问题。）
 *
 * 另外：本文件注释里刻意不使用反引号。曾经在注释里写过一对反引号包裹的
 * 通配符，next build 的类型检查阶段会在那一行报「Expression expected」，
 * 而 tsc --noEmit 却是通过的 —— 排查成本远高于收益，因此避开。
 */
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 不用 import.meta.dirname（Node 20.11+ 才有），用 fileURLToPath 更兼容
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/*
 * 按项目既有约定手动预载（见 prisma 下的脚本）：.env.local 优先、.env 兜底，
 * 且不覆盖已有的 shell 变量（便于临时用环境变量覆盖测试）。
 * Next.js 应用自身不需要这一步（它原生加载 .env），但独立进程必须自己加载。
 */
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })

async function main() {
  const to = process.argv[2]
  if (!to || !to.includes("@")) {
    console.error("用法：npx tsx scripts/email-test.mts 你的邮箱@example.com")
    process.exit(1)
  }

  // 动态 import：必须在上面的 dotenvConfig 之后
  const { apiKeyFingerprint, getEmailFrom, sendEmail, isEmailEnabled } = await import(
    "../src/lib/email/sender"
  )
  const { CODE_TTL_MINUTES, renderCodeEmail } = await import("../src/lib/email/templates")

  console.log("—— 配置 ——")
  console.log("  EMAIL_ENABLED  : " + isEmailEnabled())
  console.log("  RESEND_API_KEY : " + apiKeyFingerprint())
  console.log("  EMAIL_FROM     : " + getEmailFrom())
  console.log("")

  if (!process.env.RESEND_API_KEY) {
    console.error("✗ 没有读到 RESEND_API_KEY。")
    console.error("  这说明当前 shell 与 .env 里都没有它。检查：")
    console.error("    - " + path.join(root, ".env") + " 里是否有 RESEND_API_KEY=re_xxx")
    console.error("    - 文件编码是否为 UTF-8（不要带 BOM）")
    console.error("    - 等号两侧不要有空格；值不要用引号包（若包了就保持一致）")
    process.exit(1)
  }

  if (!isEmailEnabled()) {
    console.error("✗ EMAIL_ENABLED=false，邮件功能被显式关闭了。")
    console.error("  去掉这一行或改为 true 后重试。")
    process.exit(1)
  }

  // 用一个一眼能看出是测试的验证码
  const code = "123456"
  const { subject, html, text } = renderCodeEmail({
    scene: "login",
    code,
    siteName: process.env.EMAIL_SITE_NAME?.trim() || "lankHub",
  })

  console.log("—— 发送 ——")
  console.log("  收件人 : " + to)
  console.log("  主题   : " + subject)
  console.log("  （这是一个测试验证码，不是真的登录请求）")
  console.log("")

  const result = await sendEmail({ to, subject, html, text })

  if (result.ok) {
    console.log("✅ Resend 已接受，邮件 ID：" + (result.id ?? "(未返回)"))
    console.log("   去收件箱看看（注意垃圾邮件）。验证码应为 " + code + "，")
    console.log("   邮件里写的有效期是 " + CODE_TTL_MINUTES + " 分钟。")
    console.log("")
    console.log("如果收到了，说明发送链路完全正常，可以继续后面的开发。")
    return
  }

  console.error("✗ 发送失败：" + result.error)
  if (result.status) console.error("  Resend HTTP 状态码：" + result.status)
  if (result.status === 401) {
    console.error("  → Key 无效或已吊销。去 resend.com/api-keys 核对，")
    console.error("    并确认 .env 里写入的是新 Key（旧 Key 已吊销）。")
  } else if (result.status === 403) {
    console.error("  → 发件域名未验证，或 from 地址不属于已验证域名。")
  } else if (result.status === 429) {
    console.error("  → 触发 Resend 限流或额度上限。")
  }
  process.exit(1)
}

main().catch((err) => {
  console.error("脚本异常：", err)
  process.exit(1)
})
