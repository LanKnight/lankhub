/*
 * P5 验收：音乐悬浮按钮 + 侧边抽屉 + 播放器提到根布局
 *
 * 关键断言不是"有没有按钮"，而是：
 *   1) <audio> 只有一个（去掉内层 Provider 后不能重复）
 *   2) 客户端路由切换后，同一个 <audio> 元素仍存在（打标记验证没被重建）
 * —— 这决定了"切页音乐不断"这件事到底成立不成立。
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9500 + Math.floor(Math.random() * 9)
const PORT = 5100 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/p5"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-p5-" + Date.now(), "--window-size=1440,1100", "about:blank"], { stdio: "ignore" })

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

const errors = []

try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Log.enable")
  cdp.send = cdp.send.bind(cdp)
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })

  for (const event of ["Runtime.consoleAPICalled", "Runtime.exceptionThrown"]) {
    // 收集控制台错误（通过 Log.entryAdded 不够，异常走这里）
  }

  // 首页 -> 关公告
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1500)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-09")`)

  // 0) 未登录：不应出现音乐按钮（歌单是私人的，点了也全是 401）
  await cdp.send("Page.navigate", { url: `${BASE}/blog` })
  await sleep(1800)
  const anonDock = await run(`Boolean([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '音乐'))`)
  check("未登录时不显示音乐按钮", anonDock === false, String(anonDock))

  // 登录（站长）后再测
  const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
  const ownerDb = new Database("dev.db", { readonly: true })
  const owner = ownerDb.prepare("select id from User where role='OWNER' limit 1").get()
  ownerDb.close()
  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })

  // 1) /blog 上有悬浮按钮
  await cdp.send("Page.navigate", { url: `${BASE}/blog` })
  await sleep(2200)
  const dockInfo = await run(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '音乐')
    return {
      hasButton: Boolean(btn),
      audioCount: document.querySelectorAll('audio').length,
      bottom: btn ? btn.getBoundingClientRect().bottom : null,
    }
  })()`)
  check("/blog 上有音乐悬浮按钮", dockInfo.hasButton, JSON.stringify(dockInfo))
  check("整页只有 1 个 <audio>（根布局）", dockInfo.audioCount === 1, `audio=${dockInfo.audioCount}`)

  // 2) 单击打开抽屉
  await run(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '音乐')?.click()`)
  await sleep(600)
  const drawer = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="音乐控制"]')
    return {
      open: Boolean(dialog),
      text: dialog ? dialog.innerText.replace(/\\s+/g, ' ').slice(0, 80) : '',
      hasPlaylistLink: Boolean(dialog?.querySelector('a[href="/music"]')),
      hasPrev: Boolean(dialog?.querySelector('button[aria-label="上一首"]')),
      hasNext: Boolean(dialog?.querySelector('button[aria-label="下一首"]')),
    }
  })()`)
  check("单击打开侧边抽屉", drawer.open, JSON.stringify(drawer))
  check("抽屉里有上一首/下一首", drawer.hasPrev && drawer.hasNext)
  check("抽屉里有「进入歌单」", drawer.hasPlaylistLink)
  await shot("dock-open")

  // 3) Esc 关闭
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(300)
  check("Esc 能收起抽屉", await run(`!document.querySelector('[role="dialog"][aria-label="音乐控制"]')`))

  // 4) 打标记，做客户端路由跳转，验证 <audio> 没被重建
  await run(`(() => { const a = document.querySelector('audio'); if (a) a.dataset.persistProbe = 'kept'; return Boolean(a) })()`)
  await run(`[...document.querySelectorAll('header nav a')].find((a) => a.getAttribute('href') === '/resume')?.click()`)
  await sleep(2000)
  const persisted = await run(`(() => {
    const a = document.querySelector('audio')
    return { url: location.pathname, count: document.querySelectorAll('audio').length, probe: a?.dataset.persistProbe ?? null }
  })()`)
  check("客户端路由已切换（/resume）", persisted.url === "/resume", persisted.url)
  check("切换后仍是同一个 <audio>（播放不会中断）", persisted.probe === "kept" && persisted.count === 1, JSON.stringify(persisted))

  // 5) /music 页：不显示悬浮按钮，但播放器只有一个
  await cdp.send("Page.navigate", { url: `${BASE}/music` })
  await sleep(2500)
  const musicPage = await run(`(() => ({
    hasDock: Boolean([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '音乐')),
    audioCount: document.querySelectorAll('audio').length,
    len: (document.body.innerText || '').length,
  }))()`)
  check("/music 页不显示悬浮按钮", musicPage.hasDock === false, JSON.stringify(musicPage))
  check("/music 页也只有 1 个 <audio>", musicPage.audioCount === 1, `audio=${musicPage.audioCount}`)
  check("/music 页有内容", musicPage.len > 100, `len=${musicPage.len}`)
  await shot("music-page")

  // 6) 双击进歌单
  await cdp.send("Page.navigate", { url: `${BASE}/blog` })
  await sleep(1800)
  await run(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '音乐')
    btn?.click()
    setTimeout(() => btn?.click(), 80)
    return true
  })()`)
  await sleep(1800)
  const afterDouble = await run(`location.pathname`)
  check("双击按钮进入 /music", afterDouble === "/music", afterDouble)

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
