/*
 * 小快验证：编辑器插图 / 简历头像 是否走压缩。
 * 每一步都有硬超时，最长约 45 秒，不会挂住。
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9900 + Math.floor(Math.random() * 9)
const PORT = 5700 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/upload"
mkdirSync(OUT, { recursive: true })

function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, "ascii"); const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, c])
}
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let seed = 0x9e3779b9
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) & 0xff }
  let p = 0
  for (let y = 0; y < h; y++) { raw[p++] = 0; for (let x = 0; x < w; x++) { raw[p++] = rnd(); raw[p++] = rnd(); raw[p++] = rnd() } }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))])
}

const file = `${OUT}/small-inline.png`
const png = makePng(900, 600)
writeFileSync(file, png)
console.log(`造图：900x600 PNG ${(png.length / 1024 / 1024).toFixed(2)}MB`)

const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
const db = new Database("dev.db", { readonly: true })
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
db.close()

let pass = 0
const fail = []
const check = (n, ok, d = "") => { ok ? pass++ : fail.push(n); console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`) }

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-up2-" + Date.now(), "--window-size=1440,1000", "about:blank"], { stdio: "ignore" })

let cdp
async function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map(); let seq = 1
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws")) })
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { ok, bad } = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error("cdp")) : ok(d.result) } }
  // 浏览器崩溃/被关闭时必须让挂起的请求失败，否则脚本会永远等下去
  ws.onclose = () => { for (const { bad } of pending.values()) bad(new Error("ws closed")); pending.clear() }
  ws.onerror = () => { for (const { bad } of pending.values()) bad(new Error("ws error")); pending.clear() }
  return {
    send(method, params = {}) {
      const n = seq++
      return new Promise((ok, bad) => {
        const timer = setTimeout(() => { pending.delete(n); bad(new Error("cdp timeout: " + method)) }, 20000)
        pending.set(n, { ok: (v) => { clearTimeout(timer); ok(v) }, bad: (e) => { clearTimeout(timer); bad(e) } })
        ws.send(JSON.stringify({ id: n, method, params }))
      })
    },
    close: () => ws.close(),
  }
}
const run = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error("eval")
  return r.result.value
}
const until = async (expr, ms = 25000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await run(expr).catch(() => null)
    if (v) return v
    await sleep(400)
  }
  return null
}

const started = Date.now()
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(400) }
  for (let i = 0; i < 40; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(200) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("DOM.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })

  // ---------- 编辑器插图 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/admin/articles/new` })
  const toolbar = await until(`Boolean([...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '') === '插入图片'))`, 20000)
  check("编辑器工具栏加载出来", Boolean(toolbar))

  await run(`(() => {
    const orig = document.createElement.bind(document)
    document.createElement = (tag, ...rest) => {
      const el = orig(tag, ...rest)
      if (String(tag).toLowerCase() === 'input') { window.__fi = el; document.body.appendChild(el) }
      return el
    }
    return true
  })()`)
  await run(`[...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '') === '插入图片')?.click()`)
  const injected = await run(`(async () => {
    const input = window.__fi
    if (!input) return { ok: false, reason: "no input" }
    const w = 2200, h = 1400
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(w, h)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (i * 2654435761) >>> 0
      img.data[i] = v & 255
      img.data[i + 1] = (v >>> 8) & 255
      img.data[i + 2] = (v >>> 16) & 255
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
    const f = new File([blob], 'inline-test.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(f)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, size: f.size }
  })()`)
  check("在页面内造图并触发上传", Boolean(injected?.ok), JSON.stringify({ size: injected?.size }))
  if (injected?.ok) {
    const src = await until(`(() => { const img = [...document.querySelectorAll('.ProseMirror img')].pop(); return img ? img.getAttribute('src') : null })()`, 25000)
    check("插图已插入正文", Boolean(src), src || "超时未出现")
    if (src) {
      const stat = await run(`(async () => { const r = await fetch(${JSON.stringify(src)}); const b = await r.blob(); return { size: b.size, type: b.type } })()`)
      check("插图是 webp", String(src).endsWith(".webp"), src)
      check("插图体积明显变小", stat.size < png.length, `${(png.length / 1024).toFixed(0)}KB → ${(stat.size / 1024).toFixed(0)}KB`)
    }
  }

  // ---------- 简历头像 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/admin/resume` })
  const avatarInput = await until(`Boolean([...document.querySelectorAll('input[type="file"]')].find((el) => (el.getAttribute('accept') || '').includes('image')))`, 20000)
  check("简历页有头像输入", Boolean(avatarInput))
  if (avatarInput) {
    const avatarInjected = await run(`(async () => {
      const input = [...document.querySelectorAll('input[type="file"]')].find((el) => (el.getAttribute('accept') || '').includes('image'))
      if (!input) return { ok: false }
      const w = 800, h = 800
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      const img = ctx.createImageData(w, h)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (i * 2246822519) >>> 0
        img.data[i] = v & 255
        img.data[i + 1] = (v >>> 8) & 255
        img.data[i + 2] = (v >>> 16) & 255
        img.data[i + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const f = new File([blob], 'avatar-test.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(f)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, size: f.size }
    })()`)
    check("头像：页面内造图并触发上传", Boolean(avatarInjected?.ok), JSON.stringify({ size: avatarInjected?.size }))
    const avatarSrc = await until(`(() => { const imgs = [...document.querySelectorAll('img')].map((el) => el.getAttribute('src') || ''); return imgs.find((s) => s.includes('/api/images/')) || null })()`, 25000)
    check("头像已上传并显示", Boolean(avatarSrc), avatarSrc || "超时未出现")
    if (avatarSrc) {
      const stat = await run(`(async () => { const r = await fetch(${JSON.stringify(avatarSrc)}); const b = await r.blob(); return { size: b.size, type: b.type } })()`)
      check("头像是 webp", String(avatarSrc).endsWith(".webp"), avatarSrc)
      check("头像体积 < 400KB", stat.size < 400 * 1024, `${(stat.size / 1024).toFixed(0)}KB`)
    }
  }

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  await sleep(400)
  console.log(`\n耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`===== ${pass} 通过 / ${fail.length} 失败 =====`)
}
if (fail.length) process.exit(1)
