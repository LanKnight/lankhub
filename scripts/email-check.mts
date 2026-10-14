/*
 * 验证邮件模块：自检接口的行为、源码脱敏约定、以及全仓库密钥泄露扫描。
 *
 * 用法（需要应用已在 127.0.0.1:3000 运行）：
 *   npx tsx scripts/email-check.mts
 *
 * 这是本项目的**密钥泄露防线**：仓库是开源的，而本站已经因为文档里
 * 写了 Key 的前 8 个字符而被迫吊销重发（见 docs/emailAuthDevDoc.md 第 1.4 节）。
 * 每次改邮件相关代码后都该跑一遍。
 *
 * 为什么是 .mts 且带类型标注：tsconfig 的 include 含 ** / *.ts 与 ** / *.mts，
 * 会被 next build 的类型检查扫到 —— strict 下无类型会直接让 build 失败。
 * 另外注释里刻意不使用反引号：在注释里写反引号包裹的片段会让 next 的类型检查阶段
 * 报「Expression expected」，而 tsc --noEmit 却是通过的，排查成本极高。
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

/**
 * 被测应用的地址。可用 EMAIL_CHECK_BASE 覆盖。
 *
 * ⚠️ 这个脚本的【1】节断言的是「Key **未**配置」时的行为。
 * 所以它要在**本地**跑（本地 .env 没有 RESEND_API_KEY），
 * 或者指向一个刻意不配 Key 的实例。在配好 Key 的服务器上跑会失败 ——
 * 那是预期行为，不是脚本坏了。
 */
const BASE = process.env.EMAIL_CHECK_BASE?.trim() || "http://127.0.0.1:3000"
let pass = 0
const fail: string[] = []

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

console.log("\n【1】/api/auth/email-health 在「Key 未配置」时的行为")
{
  const res = await fetch(`${BASE}/api/auth/email-health`)
  check("接口可达（200）", res.status === 200, `status=${res.status}`)
  const data = await res.json()
  console.log("    返回：" + JSON.stringify(data))

  check("keyLoaded 为 false（本地没配 Key）", data.keyLoaded === false)
  check("keyLength 为 0", data.keyLength === 0)
  check("keyFingerprint 明确写「未配置」", data.keyFingerprint === "未配置", data.keyFingerprint)
  check("keyFormatLooksValid 为 false", data.keyFormatLooksValid === false)
  check("回显了 from 地址", typeof data.from === "string" && data.from.includes("@"), data.from)
  check("回显了 from 的域名", data.fromDomain === "lankhub.xyz", data.fromDomain)
  check("EMAIL_ENABLED 默认为 true", data.enabled === true)
  check("带 checkedAt 时间戳", typeof data.checkedAt === "string")

  // ★ 最关键的一条：接口绝不能回泄露 Key 的字段
  const raw = JSON.stringify(data)
  check(
    "返回值里没有任何 Key 字符（只有长度）",
    !/re_[A-Za-z0-9]/.test(raw),
    "不含 re_ 开头的真实字符"
  )
  const keys = Object.keys(data)
  check(
    "没有名为 key / apiKey / value 之类会泄露原文的字段",
    !keys.some((k) => /^(key|apiKey|value|secret)$/i.test(k)),
    keys.join(", ")
  )
  check("没有把 process.env 整个回显", !("env" in data) && !("processEnv" in data))
}

console.log("\n【2】源码层面的脱敏与约定检查")
{
  const sender = readFileSync("src/lib/email/sender.ts", "utf-8")
  const health = readFileSync("src/app/api/auth/email-health/route.ts", "utf-8")
  const tpl = readFileSync("src/lib/email/templates.ts", "utf-8")
  const example = readFileSync(".env.example", "utf-8")

  check("sender.ts 里没有硬编码的 Key", !/re_[A-Za-z0-9]{6,}/.test(sender))
  check("health 路由里没有硬编码的 Key", !/re_[A-Za-z0-9]{6,}/.test(health))
  check("templates.ts 里没有硬编码的 Key", !/re_[A-Za-z0-9]{6,}/.test(tpl))

  check(
    "sender.ts 的日志指纹只回长度、不回字符",
    sender.includes("已配置（长度 ${key.length}）") && !/key\.slice|key\.substring|key\.substr/.test(sender)
  )
  check(
    "sender.ts 没有真的 import server-only（注释里提到它不算）",
    !/^\s*import\s+["']server-only["']/m.test(sender),
    "该包未安装，不能真的 import"
  )
  check("sender.ts 用 fetch 而不是 resend SDK", sender.includes("api.resend.com") && !/from "resend"/.test(sender))
  check("sender.ts 设了超时", sender.includes("AbortController") && sender.includes("TIMEOUT_MS"))
  check(
    "sender.ts 对 401/403/429 有区分文案",
    sender.includes("鉴权失败") && sender.includes("域名未通过验证") && sender.includes("限流")
  )

  // ⚠️ 只认可疑的「长 Key」，不匹配文档里的占位示例（re_xxx / re_xxxxxxxx）
  const looksLikeRealKey = (s: string): boolean => /re_[A-Za-z0-9]{12,}/.test(s)
  check(".env.example 里没有真实 Key", !looksLikeRealKey(example))
  check(".env.example 里 RESEND_API_KEY 初始是空的", /^RESEND_API_KEY=""$/m.test(example))
  check(".env.example 说明了不要放 /etc/profile.d", example.includes("/etc/profile.d"))

  check("模板有纯文本版本（text）", tpl.includes("const text = ["))
  check("模板写明有效期常量", tpl.includes("CODE_TTL_MINUTES"))
  check("模板含「非本人操作请忽略」提示", tpl.includes("忽略这封邮件"))
  check("四个场景都有独立文案", ["register", "login", "reset", "change"].every((s) => tpl.includes(s)))

  const test = readFileSync("scripts/email-test.mts", "utf-8")
  check("测试脚本用 .mts（避免被 next build 类型检查扫到顶层 await）", true)
  check("测试脚本用动态 import 保证 dotenv 先执行", test.includes("await import("))
  check("测试脚本注释里没有反引号（会触发 next 类型检查误报）", !test.includes("`"), "已避开")
}

console.log("\n【3】全仓库密钥泄露扫描（只扫 git 跟踪的文件）")
{
  const { execSync } = await import("node:child_process")
  const files = execSync("git ls-files", { encoding: "utf-8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    // 二进制与依赖不用扫
    .filter((f) => !/\.(png|jpg|jpeg|webp|ico|gif|woff2?|ttf|db|pdf)$/i.test(f))
    .filter((f) => !f.startsWith("package-lock.json"))

  // 真实 Key 很长，占位示例都很短，用 12 位以上做门槛避免误报
  const patterns = [
    { name: "Resend Key", re: /re_[A-Za-z0-9]{12,}/ },
    { name: "OpenAI 风格 Key", re: /sk-[A-Za-z0-9]{20,}/ },
    { name: "Google API Key", re: /AIza[A-Za-z0-9_-]{30,}/ },
    {
      /*
       * ⚠️ 私钥不能只匹配 -----BEGIN ... PRIVATE KEY-----。
       * 帮助文本里常常会写「看一下开头应为 -----BEGIN PRIVATE KEY-----」，
       * 第一版就因此误报了 scripts/https/enable.sh 的一行提示。
       * 真实的 PEM 会在头之后跟着**大段 base64 主体**，所以要求后面确实有长 base64 行。
       */
      name: "私钥（含 base64 主体）",
      re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{0,80}?[A-Za-z0-9+/]{60,}/,
    },
  ]

  let hits = 0
  for (const f of files) {
    let content
    try {
      content = readFileSync(f, "utf-8")
    } catch {
      continue
    }
    for (const p of patterns) {
      const m = content.match(p.re)
      if (m) {
        // 自己这个扫描脚本里有正则字面量，跳过自身避免自指
        if (f === "scripts/_email-check.mjs") continue
        hits += 1
        console.log(`  ✗ ${f} 命中 ${p.name}：${m[0].slice(0, 6)}…（长度 ${m[0].length}）`)
      }
    }
  }
  check(`git 跟踪的 ${files.length} 个文件里没有真实密钥`, hits === 0, hits === 0 ? "" : `${hits} 处命中`)
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  for (const f of fail) console.log(`  - ${f}`)
  process.exitCode = 1
}
