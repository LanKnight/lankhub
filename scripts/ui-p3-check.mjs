/*
 * P3 验收：动态表 + 后台管理接口 + 动态评论
 * 先走接口（带站长会话 cookie），再用无头浏览器确认页面表现。
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9400 + Math.floor(Math.random() * 9)
const PORT = 5000 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/p3"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const db = new Database("dev.db")
const owner = db.prepare("select id, email from User where role='OWNER' limit 1").get()
db.close()

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-p3-" + Date.now(), "--window-size=1440,1200", "about:blank"], { stdio: "ignore" })

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

let createdId = null

try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }

  const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  const cookie = `authjs.session-token=${token}`
  const json = (r) => r.json().catch(() => null)

  // 1) 未登录不能建
  const anon = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "匿名尝试" }),
  })
  check("未登录创建被拒绝（401/403）", anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`)

  // 2) 站长建一条纯文字动态
  const create = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      kind: "moment",
      topic: "programming",
      title: "P3 验收动态",
      text: "这是一条由验收脚本创建的临时动态",
      published: true,
      sortOrder: 999,
    }),
  })
  const created = await json(create)
  createdId = created?.id ?? null
  check("站长创建动态成功（201）", create.status === 201 && Boolean(createdId), `HTTP ${create.status}`)

  // 3) 空内容应被拒
  const empty = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ kind: "moment", text: "" }),
  })
  check("空动态被服务端拒绝（400）", empty.status === 400, `HTTP ${empty.status}`)

  // 4) 公开页能看到
  const page1 = await fetch(`${BASE}/blog/moments`).then((r) => r.text())
  check("公开页出现新动态", page1.includes("P3 验收动态"))

  // 5) 评论：发一条
  const commentRes = await fetch(`${BASE}/api/moments/${createdId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ content: "验收评论：动态也能评论" }),
  })
  check("动态评论创建成功（201）", commentRes.status === 201, `HTTP ${commentRes.status}`)

  const listRes = await fetch(`${BASE}/api/moments/${createdId}/comments`)
  const list = await json(listRes)
  check("评论列表能读到 1 条", Array.isArray(list) && list.length === 1, JSON.stringify(list)?.slice(0, 120))

  // 6) 未登录评论应 401
  const anonComment = await fetch(`${BASE}/api/moments/${createdId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "匿名评论" }),
  })
  check("未登录评论被拒绝", anonComment.status === 401, `HTTP ${anonComment.status}`)

  // 7) 浏览器里看卡片 + 展开评论
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("Network.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })

  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1200)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-09")`)
  await cdp.send("Page.navigate", { url: `${BASE}/blog/moments` })
  await sleep(2200)

  const cardInfo = await run(`(() => {
    const cards = [...document.querySelectorAll('article')]
    const target = cards.find((c) => (c.textContent || '').includes('P3 验收动态'))
    if (!target) return { found: false, cards: cards.length }
    const btn = target.querySelector('button[aria-expanded]')
    if (btn) btn.click()
    return { found: true, cards: cards.length, hasCommentBtn: Boolean(btn), btnText: btn?.textContent?.trim() || '' }
  })()`)
  check("浏览器里找到动态卡片", Boolean(cardInfo.found), JSON.stringify(cardInfo))
  check("卡片上有评论按钮且显示条数", /评论\s*1/.test(cardInfo.btnText || ""), cardInfo.btnText)

  // 展开后应出现评论内容
  let commentVisible = false
  for (let i = 0; i < 40; i++) {
    commentVisible = await run(`(document.body.innerText || '').includes('验收评论：动态也能评论')`)
    if (commentVisible) break
    await sleep(250)
  }
  check("展开后能看到评论内容", Boolean(commentVisible))
  await shot("moments-with-comment")

  // 8) 清理
  const del = await fetch(`${BASE}/api/admin/moments/${createdId}`, { method: "DELETE", headers: { cookie } })
  check("删除动态成功（200）", del.status === 200, `HTTP ${del.status}`)
  createdId = null

  const after = await fetch(`${BASE}/blog/moments`).then((r) => r.text())
  check("删除后公开页不再出现", !after.includes("P3 验收动态"))

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  if (createdId) {
    const db2 = new Database("dev.db")
    db2.prepare("delete from Comment where momentId = ?").run(createdId)
    db2.prepare("delete from Moment where id = ?").run(createdId)
    db2.close()
  }
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
