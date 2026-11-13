/*
 * 临时：验证江湖模式是否会泄漏到其它页面（scene 属性挂在 <html> 上且没有卸载清理）
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9720 + Math.floor(Math.random() * 9)
const PORT = 5580 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-leak-" + Date.now(), "--window-size=1440,900", "about:blank"], { stdio: "ignore" })

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

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1600)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-12")`)
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(2000)

  await run(`[...document.querySelectorAll('button')].find((b) => b.hasAttribute('aria-pressed'))?.click()`)
  await sleep(800)
  const onHome = await run(`document.documentElement.getAttribute('data-hero-scene')`)
  console.log("首页切换后 scene =", onHome)

  // 客户端跳到 /blog
  await run(`[...document.querySelectorAll('header nav a')].find((a) => a.getAttribute('href') === '/blog')?.click()`)
  await sleep(2000)
  const after = await run(`(() => {
    const header = document.querySelector('header.site-navbar')
    return {
      path: location.pathname,
      scene: document.documentElement.getAttribute('data-hero-scene'),
      navbarBg: header ? getComputedStyle(header).backgroundColor : null,
      footerBg: (() => { const f = document.querySelector('footer'); return f ? getComputedStyle(f).backgroundColor : null })(),
    }
  })()`)
  console.log("跳到 /blog 后：", JSON.stringify(after))
  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  await sleep(500)
}
