/*
 * P1 验收：纯白配色 + 顶栏三项 + 齿轮下拉 + 首页只留首屏
 * 输出：截图（.ui-shots/p1/*.png）与逐项断言
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9210 + Math.floor(Math.random() * 9)
const PORT = 4800 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/p1"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const db = new Database("dev.db")
const owner = db.prepare("select id, email from User where role = 'OWNER' limit 1").get()
const article = db.prepare("select slug from Article where published = 1 limit 1").get()

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-p1-" + Date.now(), "--window-size=1440,1000", "about:blank"], { stdio: "ignore" })

let cdp
async function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let seq = 1
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws")) })
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { const { ok, bad } = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error(JSON.stringify(d.error))) : ok(d.result) }
  }
  return {
    send(method, params = {}) { const n = seq++; return new Promise((ok, bad) => { pending.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params })) }) },
    close: () => ws.close(),
  }
}
const run = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "异常")
  return r.result.value
}
const shot = async (name) => {
  const r = await cdp.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"))
}

try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Network.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  // ---------- 首页 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(2600)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-09")`)
  // 万一还弹着（版本号被改过），直接点关闭
  await run(`(() => { const btn = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "关闭" || (b.textContent || "").trim() === "确定"); if (btn) btn.click(); return true })()`)
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(2600)

  const home = await run(`(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor
    const text = document.body.innerText || ""
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    return {
      bodyBg,
      hasAbout: ids.includes('about') || /关于我/.test(text),
      hasHobbies: /兴趣爱好/.test(text),
      hasMotto: /座右铭/.test(text),
      hasScrollHint: Boolean(document.querySelector('.hero-scroll-hint')),
      navLabels: [...document.querySelectorAll('header nav a')].map((a) => a.textContent.trim()).filter((x) => x && x !== '登录'),
      docHeight: document.body.scrollHeight,
      viewport: window.innerHeight,
    }
  })()`)
  check("页面底色是纯白", home.bodyBg === "rgb(255, 255, 255)", home.bodyBg)
  check("首页没有「关于我」", !home.hasAbout)
  check("首页没有「兴趣爱好」", !home.hasHobbies)
  check("首页没有「座右铭」", !home.hasMotto)
  check("首页没有向下滚动按钮", !home.hasScrollHint)
  check("首页高度≈一屏（没有多余区块）", home.docHeight <= home.viewport + 260, `doc=${home.docHeight} vp=${home.viewport}`)
  check("顶栏是 首页/博客/简历", JSON.stringify(home.navLabels) === JSON.stringify(["首页", "博客", "简历"]), JSON.stringify(home.navLabels))
  await shot("home")

  // ---------- 公开页遍历 ----------
  const pages = [
    ["blog", "/blog"],
    ["blog-collections", "/blog/collections"],
    ["blog-article", `/blog/${article.slug}`],
    ["resume", "/resume"],
    ["poems", "/poems"],
    ["music", "/music"],
  ]
  for (const [name, path] of pages) {
    await cdp.send("Page.navigate", { url: `${BASE}${path}` })
    await sleep(1800)
    const state = await run(`(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      nav: [...document.querySelectorAll('header nav a')].map((a) => a.textContent.trim()).filter((x) => x && x !== '登录'),
      len: (document.body.innerText || '').length,
    }))()`)
    check(`${path} 底色纯白`, state.bg === "rgb(255, 255, 255)", state.bg)
    check(`${path} 顶栏三项`, JSON.stringify(state.nav) === JSON.stringify(["首页", "博客", "简历"]), JSON.stringify(state.nav))
    check(`${path} 有内容`, state.len > 120, `len=${state.len}`)
    await shot(name)
  }

  // ---------- 登录态：齿轮下拉 ----------
  const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/blog` })
  await sleep(2000)
  const trigger = await run(`(() => {
    const btn = document.querySelector('header button[aria-haspopup="menu"]')
    if (!btn) return false
    btn.click()
    return true
  })()`)
  await sleep(400)
  const menu = await run(`(() => {
    const m = document.querySelector('header [role="menu"]')
    return m ? [...m.querySelectorAll('a,button')].map((el) => el.textContent.trim()) : null
  })()`)
  check("齿轮按钮存在且可点开", Boolean(trigger) && Array.isArray(menu), JSON.stringify(menu))
  check("下拉含 管理后台/账号设置/退出登录", Array.isArray(menu) && menu.includes("管理后台") && menu.includes("账号设置") && menu.includes("退出登录"), JSON.stringify(menu))
  await shot("account-menu")

  // 点外面能关闭
  await run(`document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`)
  await sleep(300)
  const closed = await run(`!document.querySelector('header [role="menu"]')`)
  check("点外部可关闭下拉", Boolean(closed))

  // ---------- 后台页 ----------
  for (const [name, path] of [["admin", "/admin"], ["admin-articles", "/admin/articles"], ["settings", "/settings"]]) {
    await cdp.send("Page.navigate", { url: `${BASE}${path}` })
    await sleep(1800)
    const st = await run(`(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      len: (document.body.innerText || '').length,
      navCount: document.querySelectorAll('header nav a').length,
    }))()`)
    check(`${path} 底色纯白`, st.bg === "rgb(255, 255, 255)", st.bg)
    check(`${path} 有内容`, st.len > 120, `len=${st.len}`)
    await shot(name)
  }

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  db.close()
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
