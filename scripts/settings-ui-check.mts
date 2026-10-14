/*
 * 验证 /settings 三个入口与改密码双路（需要登录，所以要先拿真实会话 cookie 注入浏览器）。
 *
 * 为什么不能只靠构建通过：这一轮改的全是交互（标签页切换、列表入口、轻确认），
 * 构建成功完全不代表点得动 —— 上一轮我就吃过「渲染正常但断言写错」的亏。
 *
 * 用法：npx tsx scripts/settings-ui-check.mts
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })
const { prisma } = await import("../src/lib/prisma")

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DEVTOOLS_PORT = 9244
const APP_PORT = 3106
const MOCK_PORT = 45894
const BASE = `http://127.0.0.1:${APP_PORT}`

mkdirSync(".ui-shots", { recursive: true })

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

let lastCode = ""
const mock = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    try {
      const b = JSON.parse(raw) as { html: string }
      const m = b.html.match(/letter-spacing:8px[^>]*>(\d{6})</)
      lastCode = m ? m[1] : ""
    } catch {
      /* 忽略 */
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ id: "mock" }))
  })
})
await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", () => r()))

const app = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "next", "start", "-p", String(APP_PORT)],
  {
    env: {
      ...process.env,
      RESEND_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
      RESEND_API_KEY: "re_mock_for_settings_ui_000",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  }
)
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/api/auth/email-health`)).ok) break
  } catch {
    /* 还没起来 */
  }
  await sleep(500)
}

function mergeCookie(res: Response, prev = ""): string {
  const jar = new Map<string, string>()
  for (const p of prev.split("; ").filter(Boolean)) {
    const i = p.indexOf("=")
    jar.set(p.slice(0, i), p.slice(i + 1))
  }
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function connect(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let nextId = 1
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error("WebSocket 连接失败"))
  })
  ws.onmessage = (msg) => {
    const d = JSON.parse(msg.data as string)
    if (d.id && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id)!
      pending.delete(d.id)
      d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result)
    }
  }
  return {
    send(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++
      return new Promise<never>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`${method} 超时`))
          }
        }, 15000)
      })
    },
    close: () => ws.close(),
  }
}

const email = `settingsui-${Date.now()}@test.local`
const name = `设置页测试${Date.now() % 100000}`
const pwd = "test123456"

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\edge-settings-profile",
    "about:blank",
  ],
  { stdio: "ignore" }
)

try {
  // ---- 准备一个已验证账号并登录，拿到真实会话 cookie ----
  console.log("\n【0】准备登录态")
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.220.0.1" },
    body: JSON.stringify({ name, email, password: pwd }),
  })
  await prisma.emailCode.deleteMany({ where: { email } })
  await fetch(`${BASE}/api/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.220.0.2" },
    body: JSON.stringify({ email, scene: "register" }),
  })
  await fetch(`${BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.220.0.3" },
    body: JSON.stringify({ email, code: lastCode }),
  })

  let cookie = ""
  {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
    cookie = mergeCookie(csrfRes)
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ csrfToken, email, password: pwd, callbackUrl: `${BASE}/` }),
    })
    cookie = mergeCookie(res, cookie)
    check("拿到会话 cookie", /session-token/.test(cookie))
  }

  // ---- 等 DevTools ----
  let wsVersion: { Browser: string } | null = null
  for (let i = 0; i < 40; i++) {
    try {
      wsVersion = (await (
        await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)
      ).json()) as { Browser: string }
      break
    } catch {
      await sleep(250)
    }
  }
  if (!wsVersion) throw new Error("Edge DevTools 没起来")
  console.log(`  浏览器：${wsVersion.Browser}`)

  // ---- 逐页检查 ----
  const PAGES = [
    {
      path: "/settings",
      expectH1: "账号设置",
      mustHave: ["个人资料", "修改密码", "退出登录", email],
      // 不应再有表单（改密码/资料都搬走了）
      maxInputs: 0,
    },
    {
      path: "/settings/profile",
      expectH1: "个人资料",
      mustHave: ["昵称", "个人简介", "返回设置"],
      maxInputs: 99,
    },
    {
      path: "/settings/password",
      expectH1: "修改密码",
      mustHave: ["用邮箱验证码", "用旧密码", "返回设置"],
      maxInputs: 99,
    },
  ]

  for (const page of PAGES) {
    console.log(`\n【${page.path}】`)
    const t = (await (
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, { method: "PUT" })
    ).json()) as { id: string; webSocketDebuggerUrl: string }
    const cdp = await connect(t.webSocketDebuggerUrl)

    try {
      await cdp.send("Runtime.enable")
      await cdp.send("Page.enable")
      await cdp.send("Network.enable")
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 900,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false,
      })

      // 注入会话 cookie（用真实登录得到的那个）
      for (const part of cookie.split("; ")) {
        const i = part.indexOf("=")
        await cdp.send("Network.setCookie", {
          name: part.slice(0, i),
          value: part.slice(i + 1),
          domain: "127.0.0.1",
          path: "/",
        })
      }

      await cdp.send("Page.navigate", { url: `${BASE}${page.path}` })
      await sleep(3000)

      const r = (await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          h1: document.querySelector('h1')?.textContent ?? null,
          body: document.body.innerText,
          inputs: document.querySelectorAll('input').length,
          errorOverlay: !!document.querySelector('nextjs-portal'),
          url: location.pathname,
        })`,
        returnByValue: true,
      })) as { result: { value: string } }
      const info = JSON.parse(r.result.value) as {
        h1: string | null
        body: string
        inputs: number
        errorOverlay: boolean
        url: string
      }

      check("停留在目标页（没被重定向到登录页）", info.url === page.path, info.url)
      check(`标题是「${page.expectH1}」`, info.h1 === page.expectH1, `实际「${info.h1}」`)
      check("没有错误覆盖层", !info.errorOverlay)
      for (const text of page.mustHave) {
        check(`包含「${text}」`, info.body.includes(text))
      }
      if (page.maxInputs === 0) {
        check("首页已不再有表单输入框", info.inputs === 0, `${info.inputs} 个`)
      }

      const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string }
      writeFileSync(
        `.ui-shots/settings-${page.path.replace(/^\//, "").replace(/\//g, "-")}.png`,
        Buffer.from(shot.data, "base64")
      )
    } finally {
      cdp.close()
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/close/${t.id}`).catch(() => {})
    }
  }

  // ---- 交互检查：退出登录的轻确认 + 改密码标签切换 ----
  console.log("\n【交互】")
  {
    const t = (await (
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, { method: "PUT" })
    ).json()) as { id: string; webSocketDebuggerUrl: string }
    const cdp = await connect(t.webSocketDebuggerUrl)
    const run = async (expression: string) => {
      const r = (await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result: { value: unknown } }
      return r.result.value
    }

    try {
      await cdp.send("Runtime.enable")
      await cdp.send("Page.enable")
      for (const part of cookie.split("; ")) {
        const i = part.indexOf("=")
        await cdp.send("Network.setCookie", {
          name: part.slice(0, i),
          value: part.slice(i + 1),
          domain: "127.0.0.1",
          path: "/",
        })
      }

      // ① /settings：点退出登录应出现确认，而不是直接退出
      await cdp.send("Page.navigate", { url: `${BASE}/settings` })
      await sleep(2500)
      const beforeClick = (await run(`document.body.innerText`)) as string
      check("初始不显示确认文案", !beforeClick.includes("确定要退出登录吗"))

      await run(
        `[...document.querySelectorAll('button')].find(b => b.textContent.includes('退出登录'))?.click()`
      )
      await sleep(600)
      const afterClick = (await run(`document.body.innerText`)) as string
      check("★ 点击退出登录后出现轻确认", afterClick.includes("确定要退出登录吗"))
      check("确认里带上了当前邮箱（防止退错账号）", afterClick.includes(email))
      check("提供了取消按钮", afterClick.includes("取消"))

      await run(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '取消')?.click()`
      )
      await sleep(500)
      const afterCancel = (await run(`document.body.innerText`)) as string
      check("点取消后确认消失、仍未退出", !afterCancel.includes("确定要退出登录吗"))

      // ② /settings/password：两个标签可切换
      await cdp.send("Page.navigate", { url: `${BASE}/settings/password` })
      await sleep(2500)
      const tabInfo = (await run(
        `JSON.stringify({
          body: document.body.innerText,
          inputs: document.querySelectorAll('input').length,
        })`
      )) as string
      const ti = JSON.parse(tabInfo) as { body: string; inputs: number }
      const codeTabInfo = JSON.parse(
        (await run(
          `JSON.stringify({
            codeBoxes: document.querySelectorAll('input[inputmode="numeric"]').length,
            hasOldPassword: !!document.querySelector('#oldPassword'),
          })`
        )) as string
      ) as { codeBoxes: number; hasOldPassword: boolean }
      check("默认落在「用邮箱验证码」方式", ti.body.includes("用邮箱验证码"))
      check("★ 验证码方式下有 6 格验证码输入", codeTabInfo.codeBoxes === 6, `${codeTabInfo.codeBoxes} 格`)
      check("★ 验证码方式下**没有**原密码输入框", !codeTabInfo.hasOldPassword)

      await run(
        `[...document.querySelectorAll('button')].find(b => b.textContent.includes('用旧密码'))?.click()`
      )
      await sleep(600)
      /*
       * ⚠️ 判据必须看 **DOM 元素**，不能看整页文本。
       * 第一版写成 `!legacy.includes("邮箱验证码")` —— 结果被说明文字
       * 「…暂时无法使用验证码保护…」/「…不需要输入原密码」之类的小字命中，
       * 误报失败。文本里出现某个词 ≠ 那个控件存在。
       */
      const legacyInfo = JSON.parse(
        (await run(
          `JSON.stringify({
            body: document.body.innerText,
            codeBoxes: document.querySelectorAll('input[inputmode="numeric"]').length,
            passwordInputs: document.querySelectorAll('input[type="password"]').length,
            hasOldPassword: !!document.querySelector('#oldPassword'),
          })`
        )) as string
      ) as {
        body: string
        codeBoxes: number
        passwordInputs: number
        hasOldPassword: boolean
      }
      check("★ 切到「用旧密码」后出现原密码输入框", legacyInfo.hasOldPassword)
      check("★ 旧密码方式下没有验证码输入格", legacyInfo.codeBoxes === 0, `${legacyInfo.codeBoxes} 格`)
      check(
        "有三个密码输入框（原密码 + 新密码 + 确认）",
        legacyInfo.passwordInputs === 3,
        `${legacyInfo.passwordInputs} 个`
      )
    } finally {
      cdp.close()
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/close/${t.id}`).catch(() => {})
    }
  }
} catch (e) {
  console.error("\n检查出错：", (e as Error).message)
  fail.push(`脚本异常：${(e as Error).message}`)
} finally {
  edge.kill()
  app.kill()
  mock.close()

  // 清理测试账号（全站发信配额按全表算，残留会影响其他测试）
  await prisma.user.deleteMany({ where: { email: { contains: "settingsui-" } } })
  await prisma.emailCode.deleteMany({ where: { email: { contains: "settingsui-" } } })
  await prisma.$disconnect()

  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}
