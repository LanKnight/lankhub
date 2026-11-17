/*
 * 验收：文章 / 合集的删除改成「手写标题」二级确认
 *  A) 接口层：不带 confirm / confirm 不对 → 400；完全一致 → 200
 *  B) 界面层：弹窗出现、按钮默认禁用、输错仍禁用、输对才可点、删完行消失
 *  C) 动态删除保持两步确认（不受影响）
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9950 + Math.floor(Math.random() * 9)
const PORT = 5750 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/delete"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const db = new Database("dev.db")
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
const now = new Date().toISOString().replace("Z", "+00:00")
const ts = Date.now()

const articleTitle = `删除校验测试文章 ${ts}`
const articleSlug = `del-check-${ts}`
const articleId = db
  .prepare(
    "insert into Article (title, slug, content, published, authorId, createdAt, updatedAt) values (?,?,?,?,?,?,?)"
  )
  .run(articleTitle, articleSlug, JSON.stringify({ type: "doc", content: [] }), 0, owner.id, now, now).lastInsertRowid

const collectionName = `删除校验测试合集 ${ts}`
const collectionSlug = `del-coll-${ts}`
const collectionId = db
  .prepare("insert into Collection (name, slug, sortOrder, createdAt, updatedAt) values (?,?,?,?,?)")
  .run(collectionName, collectionSlug, 0, now, now).lastInsertRowid

const momentId = db
  .prepare("insert into Moment (kind, text, published, sortOrder, authorId, createdAt, updatedAt) values ('moment',?,1,0,?,?,?)")
  .run(`删除校验测试动态 ${ts}`, owner.id, now, now).lastInsertRowid
db.close()

const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-del-" + Date.now(), "--window-size=1440,1000", "about:blank"], { stdio: "ignore" })

let cdp
async function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map(); let seq = 1
  await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws")) })
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { const { ok, bad } = pending.get(d.id); pending.delete(d.id); d.error ? bad(new Error("cdp")) : ok(d.result) }
  }
  return {
    send(method, params = {}) {
      const n = seq++
      return new Promise((ok, bad) => {
        const timer = setTimeout(() => { pending.delete(n); bad(new Error("timeout " + method)) }, 20000)
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
const until = async (expr, ms = 20000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { const v = await run(expr).catch(() => null); if (v) return v; await sleep(300) }
  return null
}

const started = Date.now()
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(400) }

  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  const cookie = `authjs.session-token=${token}`
  const del = (path) => fetch(`${BASE}${path}`, { method: "DELETE", headers: { cookie } })

  // ---------- A. 接口层 ----------
  const noConfirm = await del(`/api/admin/articles/${articleId}`)
  check("文章：不带 confirm 被拒（400）", noConfirm.status === 400, `HTTP ${noConfirm.status}`)
  const wrongConfirm = await del(`/api/admin/articles/${articleId}?confirm=${encodeURIComponent("错的标题")}`)
  check("文章：标题不对被拒（400）", wrongConfirm.status === 400, `HTTP ${wrongConfirm.status}`)
  const stillThere = await fetch(`${BASE}/api/articles`).then((r) => r.json()).catch(() => [])
  check("两次被拒后文章仍在", !(Array.isArray(stillThere) ? stillThere : []).some((a) => a.slug === articleSlug))

  const collNoConfirm = await del(`/api/admin/collections/${collectionId}`)
  check("合集：不带 confirm 被拒（400）", collNoConfirm.status === 400, `HTTP ${collNoConfirm.status}`)
  const collWrong = await del(`/api/admin/collections/${collectionId}?confirm=${encodeURIComponent("错名")}`)
  check("合集：名称不对被拒（400）", collWrong.status === 400, `HTTP ${collWrong.status}`)

  // ---------- B. 界面层：文章 ----------
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(200) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1000)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-17")`)

  await cdp.send("Page.navigate", { url: `${BASE}/admin/articles` })
  check("文章列表加载", Boolean(await until(`Boolean(document.querySelector('table'))`)))
  // SSR 出表格 ≠ React 已水合；不等一下的话点击按钮不会触发 onClick
  await sleep(1800)

  // 找到测试文章那一行的垃圾桶
  const clicked = await run(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes(${JSON.stringify(articleTitle)}))
    if (!row) return false
    row.querySelector('button[aria-label="删除文章"]')?.click()
    return true
  })()`)
  const dialogAppeared = Boolean(await until(`Boolean(document.querySelector('[role="dialog"][aria-label="删除文章"]'))`))
  check("点垃圾桶后出现手写确认弹窗", clicked === true && dialogAppeared, JSON.stringify({ clicked, dialogAppeared }))

  const dialogState = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="删除文章"]')
    if (!dialog) return null
    const confirmBtn = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').includes('删除文章'))
    return {
      showsTitle: dialog.textContent.includes(${JSON.stringify(articleTitle)}),
      disabled: confirmBtn ? confirmBtn.disabled : null,
      input: Boolean(dialog.querySelector('input')),
    }
  })()`)
  check("弹窗里明码显示了要删的标题", dialogState?.showsTitle === true, JSON.stringify(dialogState))
  check("没输入时删除按钮是禁用的", dialogState?.disabled === true)
  check("弹窗里有输入框", dialogState?.input === true)

  // 输错：仍禁用
  await run(`document.querySelector('[role="dialog"][aria-label="删除文章"] input')?.focus()`)
  await cdp.send("Input.insertText", { text: "随便输个错的" })
  await sleep(300)
  const afterWrong = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="删除文章"]')
    const btn = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').includes('删除文章'))
    return { disabled: btn.disabled }
  })()`)
  check("输错时删除按钮仍禁用", afterWrong.disabled === true)

  // 用 Esc 关掉，重新打开再输正确标题（不靠脚本改 input.value，免得与 React 状态不同步）
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(400)
  check("Esc 能关掉弹窗", await run(`!document.querySelector('[role="dialog"][aria-label="删除文章"]')`))

  await run(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes(${JSON.stringify(articleTitle)}))
    row?.querySelector('button[aria-label="删除文章"]')?.click()
    return true
  })()`)
  await sleep(400)
  await run(`document.querySelector('[role="dialog"][aria-label="删除文章"] input')?.focus()`)
  await cdp.send("Input.insertText", { text: articleTitle })
  await sleep(400)
  const afterRight = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="删除文章"]')
    if (!dialog) return null
    const btn = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').includes('删除文章'))
    return { disabled: btn.disabled }
  })()`)
  check("输对后删除按钮可点", afterRight?.disabled === false, JSON.stringify(afterRight))
  await shotOrSkip("article-dialog")

  await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="删除文章"]')
    const btn = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').includes('删除文章'))
    btn.click()
    return true
  })()`)
  // 注意：不能用 body.textContent 判断 —— Next 把 RSC 数据放在内联 <script> 里，

  // 被删文章的标题仍会出现在旧脚本文本中。只看表格行才准。
  const gone = await until(`![...document.querySelectorAll('tr')].some((r) => r.textContent.includes(${JSON.stringify(articleTitle)}))`, 20000)
  check("删除成功，列表里不再有这篇", Boolean(gone))

  // ---------- C. 合集界面 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/admin/collections` })
  check("合集列表加载", Boolean(await until(`Boolean(document.querySelector('table'))`)))
  await sleep(1800)
  const collClicked = await run(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes(${JSON.stringify(collectionName)}))
    if (!row) return false
    row.querySelector('button[aria-label="删除合集"]')?.click()
    return true
  })()`)
  const collDialog = Boolean(await until(`Boolean(document.querySelector('[role="dialog"][aria-label="删除合集"]'))`))
  const collSnapshot = await run(`(() => ({
    rows: [...document.querySelectorAll('tr')].map((r) => (r.textContent || '').trim().slice(0, 28)),
    trash: [...document.querySelectorAll('button[aria-label="删除合集"]')].length,
  }))()`)
  check(
    "合集点垃圾桶也弹出手写确认",
    collClicked === true && collDialog,
    JSON.stringify({ collClicked, collDialog, collSnapshot })
  )
  await run(`document.querySelector('[role="dialog"][aria-label="删除合集"] input')?.focus()`)
  await cdp.send("Input.insertText", { text: collectionName })
  await sleep(400)
  await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="删除合集"]')
    const btn = [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').includes('删除合集'))
    btn.click()
    return true
  })()`)
  const collGone = await until(`![...document.querySelectorAll('tr')].some((r) => r.textContent.includes(${JSON.stringify(collectionName)}))`, 20000)
  check("合集删除成功", Boolean(collGone))

  // ---------- D. 动态：仍是两步确认 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/admin/moments` })
  await until(`Boolean(document.querySelector('table'))`)
  await sleep(1800)
  const momentTrash = await run(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('删除校验测试动态'))
    if (!row) return { found: false }
    const btn = [...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '删除')
    if (!btn) return { found: true, hasTrash: false }
    btn.click()
    return { found: true, hasTrash: true }
  })()`)
  check("动态那行有垃圾桶", momentTrash?.hasTrash === true, JSON.stringify(momentTrash))

  // 点完要等 React 重渲染，再看是不是"就地确认"而不是弹窗
  await sleep(700)
  const momentAfter = await run(`(() => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('删除校验测试动态'))
    const confirmBtn = row ? [...row.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '确认') : null
    return {
      inlineConfirm: Boolean(confirmBtn),
      dialog: Boolean(document.querySelector('[role="dialog"]')),
    }
  })()`)
  check(
    "动态删除仍是就地两步确认（没弹窗）",
    momentAfter?.inlineConfirm === true && momentAfter?.dialog === false,
    JSON.stringify(momentAfter)
  )

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  // 清理残留（接口层删不掉的那些）
  const cleanup = new Database("dev.db")
  cleanup.prepare("delete from Article where id = ?").run(articleId)
  cleanup.prepare("delete from Collection where id = ?").run(collectionId)
  cleanup.prepare("delete from Moment where id = ?").run(momentId)
  cleanup.close()
  await sleep(400)
}

console.log(`\n耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(`===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) process.exit(1)

async function shotOrSkip(name) {
  try {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"))
  } catch {}
}
