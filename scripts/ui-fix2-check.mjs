/*
 * 本轮修复验收：
 *  1) 动态归属（读者不能删/改站长的；自己发的能改能删）
 *  2) 江湖模式下页脚变暗（不再有白条）
 *  3) 后台顶栏恢复 首页/博客/简历
 *  4) 音乐首次播放走随机
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9800 + Math.floor(Math.random() * 9)
const PORT = 5600 + Math.floor(Math.random() * 40)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/fix2"
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
const readerId = db
  .prepare(
    "insert into User (email,password,name,role,permissions,createdAt,updatedAt) values (?,?,?,?,?,?,?)"
  )
  .run(`tmp-own-${ts}@test.local`, "x", `tmpown${ts}`, "READER", "moment", now, now).lastInsertRowid
db.close()

const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
const cookieOf = async (id, role, permissions) =>
  `authjs.session-token=${await encode({ token: { sub: String(id), id: String(id), role, permissions }, secret, salt: "authjs.session-token" })}`

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-fix2-" + Date.now(), "--window-size=1440,900", "about:blank"], { stdio: "ignore" })

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

let ownerMomentId = null
let readerMomentId = null

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }

  const ownerCookie = await cookieOf(owner.id, "OWNER", null)
  const readerCookie = await cookieOf(readerId, "READER", "moment")
  const json = (r) => r.json().catch(() => null)
  const post = (cookie, body) =>
    fetch(`${BASE}/api/admin/moments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    })

  // ---------- A. 归属 ----------
  const ownerPost = await post(ownerCookie, { kind: "moment", text: "站长发的动态（归属测试）" })
  const ownerMoment = await json(ownerPost)
  ownerMomentId = ownerMoment?.id ?? null
  check("站长发布成功且写入了 authorId", ownerPost.status === 201 && Number(ownerMoment?.authorId) === Number(owner.id), JSON.stringify({ status: ownerPost.status, authorId: ownerMoment?.authorId }))

  const readerDeleteOwner = await fetch(`${BASE}/api/admin/moments/${ownerMomentId}`, {
    method: "DELETE",
    headers: { cookie: readerCookie },
  })
  check("读者删站长的动态被拒（403）", readerDeleteOwner.status === 403, `HTTP ${readerDeleteOwner.status}`)

  const readerEditOwner = await fetch(`${BASE}/api/admin/moments/${ownerMomentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: readerCookie },
    body: JSON.stringify({ text: "读者篡改" }),
  })
  check("读者改站长的动态被拒（403）", readerEditOwner.status === 403, `HTTP ${readerEditOwner.status}`)

  const readerPost = await post(readerCookie, { kind: "moment", text: "读者自己的动态" })
  const readerMoment = await json(readerPost)
  readerMomentId = readerMoment?.id ?? null
  check("读者发布成功且 authorId 是自己", readerPost.status === 201 && Number(readerMoment?.authorId) === Number(readerId), JSON.stringify({ status: readerPost.status, authorId: readerMoment?.authorId }))

  const ownerDeleteReader = await fetch(`${BASE}/api/admin/moments/${readerMomentId}`, {
    method: "DELETE",
    headers: { cookie: ownerCookie },
  })
  check("站长能删读者的动态（200）", ownerDeleteReader.status === 200, `HTTP ${ownerDeleteReader.status}`)
  readerMomentId = null

  // 读者编辑页访问站长的动态 → 被挡（Next 的 notFound 在流式下先回 200，内容才是 404 页）
  const editPage = await fetch(`${BASE}/admin/moments/${ownerMomentId}/edit`, {
    headers: { cookie: readerCookie },
    redirect: "follow",
  })
  const editBody = await editPage.text()
  // 注意：标题「编辑动态 - 管理后台」在流式响应里可能先于 404 出现，不能用它判断；
  // 用只存在于表单里的占位文案（写点什么…）才准
  check(
    "读者打开站长动态的编辑页被挡（表单没渲染）",
    editPage.status === 404 || !editBody.includes("写点什么"),
    `HTTP ${editPage.status}  含表单:${editBody.includes("写点什么")}`
  )

  // ---------- B. 浏览器部分 ----------
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1400)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-12")`)

  // 后台顶栏：站长
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: (await cookieOf(owner.id, "OWNER", null)).split("=")[1], url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/admin` })
  await sleep(2000)
  const adminNav = await run(`(() => {
    const links = [...document.querySelectorAll('header nav a')].map((a) => a.textContent.trim()).filter((x) => x && x !== '登录')
    return { path: location.pathname, links }
  })()`)
  check("/admin 顶栏恢复了 首页/博客/简历", JSON.stringify(adminNav.links) === JSON.stringify(["首页", "博客", "简历"]), JSON.stringify(adminNav))
  await shot("admin-navbar")

  // 读者视角的动态列表：站长那条显示"只读"
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: (await cookieOf(readerId, "READER", "moment")).split("=")[1], url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/admin/moments` })
  await sleep(2000)
  const listView = await run(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')]
    const row = rows.find((r) => r.textContent.includes('站长发的动态'))
    return {
      hasRow: Boolean(row),
      rowText: row ? row.textContent.replace(/\\s+/g, ' ').slice(0, 60) : '',
      readOnly: row ? row.textContent.includes('只读') : false,
      canEdit: row ? row.textContent.includes('编辑') : null,
    }
  })()`)
  check("读者在列表里看到站长的动态", listView.hasRow, JSON.stringify(listView))
  check("站长的动态对读者显示为「只读」", listView.readOnly === true && listView.canEdit === false, JSON.stringify(listView))
  await shot("reader-moments-readonly")

  // ---------- C. 江湖模式页脚 ----------
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: "", url: `${BASE}/`, path: "/", expires: 1 })
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(2000)
  await run(`[...document.querySelectorAll('button')].find((b) => b.hasAttribute('aria-pressed'))?.click()`)
  await sleep(900)
  await run(`window.scrollTo({ top: 120, behavior: 'instant' })`)
  await sleep(400)
  const dark = await run(`(() => {
    const footer = document.querySelector('.site-footer')
    const parse = (c) => {
      const m = c.match(/rgba?\\(([^)]+)\\)/)
      if (!m) return null
      const parts = m[1].split(',').map((v) => parseFloat(v))
      return parts.slice(0, 3)
    }
    return {
      scene: document.documentElement.getAttribute('data-hero-scene'),
      footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      footerRgb: footer ? parse(getComputedStyle(footer).backgroundColor) : null,
      bodyRgb: parse(getComputedStyle(document.body).backgroundColor),
    }
  })()`)
  const isDark = (rgb) => Array.isArray(rgb) && rgb.every((v) => v < 60)
  check("已切到江湖模式", dark.scene === "jianghu", String(dark.scene))
  check("江湖模式下页脚是深色（不再白条）", isDark(dark.footerRgb), JSON.stringify({ bg: dark.footerBg, rgb: dark.footerRgb }))
  check("江湖模式下页面底色也是深色", isDark(dark.bodyRgb), JSON.stringify({ bg: dark.bodyBg }))
  await shot("jianghu-footer")

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  const cleanup = new Database("dev.db")
  for (const id of [ownerMomentId, readerMomentId].filter(Boolean)) {
    cleanup.prepare("delete from Comment where momentId = ?").run(id)
    cleanup.prepare("delete from MomentImage where momentId = ?").run(id)
    cleanup.prepare("delete from Moment where id = ?").run(id)
  }
  cleanup.prepare("delete from User where id = ?").run(readerId)
  cleanup.close()
  await sleep(600)
}

// ---------- D. 随机播放（源码断言，本地无歌可播） ----------
const dockSrc = readFileSync("src/components/music/MusicDock.tsx", "utf8")
check(
  "悬浮按钮的「开始播放」走随机（playShuffled）",
  dockSrc.includes("playShuffled(queue)") && dockSrc.includes("playShuffled(data as PlayerSong[])")
)

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
