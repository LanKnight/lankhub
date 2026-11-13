/*
 * 复现第 2 条：滚动一点后切到江湖，找出"那一小排白色"到底是哪个元素。
 * 切换用首屏那个 sr-only 按钮（aria-pressed），它直接调 toggle()。
 */
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9710 + Math.floor(Math.random() * 9)
const PORT = 5540 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/hero"
mkdirSync(OUT, { recursive: true })

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-hero2-" + Date.now(), "--window-size=1440,900", "about:blank"], { stdio: "ignore" })

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

const sample = `(() => {
  const points = []
  for (const y of [1, 10, 40, 62, 65, 68, 72, 80, 120, 300, 700, 830, 860, 890, 899]) {
    const el = document.elementFromPoint(720, y)
    if (!el) continue
    const cs = getComputedStyle(el)
    points.push({ y, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), bg: cs.backgroundColor, opacity: cs.opacity })
  }
  return {
    scrollY: Math.round(window.scrollY),
    scene: document.documentElement.getAttribute('data-hero-scene'),
    body: getComputedStyle(document.body).backgroundColor,
    bodyBgImg: getComputedStyle(document.body).backgroundImage === 'none' ? '' : 'img',
    points,
  }
})()`

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1800)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-12")`)
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(2200)

  // 用 sr-only 按钮切场景
  const toggleInfo = await run(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.hasAttribute('aria-pressed'))
    if (!btn) return { ok: false, reason: 'no aria-pressed button' }
    btn.click()
    return { ok: true, label: btn.getAttribute('aria-label') || '' }
  })()`)
  await sleep(900)
  console.log("切换结果:", JSON.stringify(toggleInfo), " scene =", await run(`document.documentElement.getAttribute('data-hero-scene')`))

  // 滚一点再取样
  await run(`window.scrollTo({ top: 120, behavior: "instant" })`)
  await sleep(600)
  const at120 = await run(sample)
  console.log(`\n[滚动 120] scene=${at120.scene} body=${at120.body}`)
  for (const p of at120.points) console.log(`  y=${String(p.y).padStart(3)}  ${p.tag.padEnd(7)} bg=${p.bg.padEnd(20)} op=${p.opacity} .${p.cls}`)
  await shot("jianghu-scrolled-120")

  // 再滚到 0 看看
  await run(`window.scrollTo({ top: 0, behavior: "instant" })`)
  await sleep(600)
  const at0 = await run(sample)
  console.log(`\n[滚动 0] scene=${at0.scene} body=${at0.body}`)
  for (const p of at0.points) console.log(`  y=${String(p.y).padStart(3)}  ${p.tag.padEnd(7)} bg=${p.bg.padEnd(20)} op=${p.opacity} .${p.cls}`)
  await shot("jianghu-top")

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  await sleep(500)
}
