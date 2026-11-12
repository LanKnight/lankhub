/*
 * P2 验收：博客三栏（博客 / 合集 / 动态）
 * 本地库没有照片数据，临时插 3 条 Photo 用于验证动态列表与主题筛选，验完删除。
 */
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9300 + Math.floor(Math.random() * 9)
const PORT = 4900 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/p2"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

// 1x1 透明的 SVG data URI，足够验证 <img> 渲染与布局
const IMG =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#e5e7eb"/><text x="400" y="235" font-size="40" text-anchor="middle" fill="#9ca3af">PHOTO</text></svg>`
  ).toString("base64")

const db = new Database("dev.db")
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
const now = new Date().toISOString().replace("Z", "+00:00")

/*
 * P3 之后动态页读的是 Moment 表（不再是旧 Photo），所以这里直接种 Moment 数据。
 * 每条动态同时插一张 MomentImage，用来验证卡片里的图片网格与主题筛选。
 */
const insertMoment = db.prepare(
  "insert into Moment (kind, topic, title, text, published, sortOrder, authorId, createdAt, updatedAt) values (?,?,?,?,?,?,?,?,?)"
)
const insertImage = db.prepare(
  "insert into MomentImage (momentId, url, width, height, sortOrder) values (?,?,?,?,?)"
)
const inserted = []
for (const [i, item] of [
  { cat: "programming", title: "写代码的下午", desc: "一个临时测试条目" },
  { cat: "programming", title: "第二次提交", desc: null },
  { cat: "gaming", title: "周末开黑", desc: "临时测试" },
].entries()) {
  const momentId = insertMoment.run(
    "moment",
    item.cat,
    item.title,
    item.desc,
    1,
    0,
    owner.id,
    now,
    now
  ).lastInsertRowid
  insertImage.run(momentId, IMG, 800, 450, 0)
  inserted.push(momentId)
}

const article = db.prepare("select slug from Article where published = 1 limit 1").get()

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-p2-" + Date.now(), "--window-size=1440,1200", "about:blank"], { stdio: "ignore" })

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
  const r = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"))
}

try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false })

  // 关掉公告弹窗（避免挡住判断）
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1500)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-09")`)

  const tabsOf = async (path) => {
    await cdp.send("Page.navigate", { url: `${BASE}${path}` })
    await sleep(1600)
    return await run(`(() => {
      const nav = document.querySelector('nav[aria-label="博客分区"]')
      if (!nav) return null
      return [...nav.querySelectorAll('a')].map((a) => ({
        label: a.textContent.trim(),
        href: a.getAttribute('href'),
        active: a.getAttribute('aria-current') === 'page',
      }))
    })()`)
  }

  // 1) 三页的标签与高亮
  const blogTabs = await tabsOf("/blog")
  check("/blog 有三个标签", Array.isArray(blogTabs) && blogTabs.length === 3, JSON.stringify(blogTabs))
  check("/blog 高亮「博客」", blogTabs?.[0]?.active === true && blogTabs?.[0]?.label === "博客")
  check("/blog 标签顺序 博客/合集/动态", JSON.stringify(blogTabs?.map((t) => t.label)) === JSON.stringify(["博客", "合集", "动态"]), JSON.stringify(blogTabs?.map((t) => t.label)))
  await shot("blog")

  const colTabs = await tabsOf("/blog/collections")
  check("/blog/collections 高亮「合集」", colTabs?.[1]?.active === true, JSON.stringify(colTabs))
  await shot("collections")

  const momTabs = await tabsOf("/blog/moments")
  check("/blog/moments 高亮「动态」", momTabs?.[2]?.active === true, JSON.stringify(momTabs))

  // 2) 动态列表
  const moments = await run(`(() => {
    const cards = [...document.querySelectorAll('article')]
    const chips = [...document.querySelectorAll('nav[aria-label="博客分区"] a')].length
    const topicChips = [...document.querySelectorAll('a[href^="/blog/moments?topic="]')].map((a) => a.textContent.trim())
    return {
      cards: cards.length,
      titles: cards.map((c) => (c.querySelector('h2')?.textContent || '')).filter(Boolean),
      images: cards.reduce((n, c) => n + c.querySelectorAll('img').length, 0),
      topicChips,
      tabs: chips,
    }
  })()`)
  check("动态页渲染出 3 条卡片", moments.cards === 3, JSON.stringify(moments).slice(0, 160))
  check("卡片带图片", moments.images === 3, `images=${moments.images}`)
  check("有主题筛选（含 码砚/弈趣）", moments.topicChips.some((t) => t.startsWith("码砚")) && moments.topicChips.some((t) => t.startsWith("弈趣")), JSON.stringify(moments.topicChips))
  await shot("moments")

  // 3) 按主题筛选
  const filtered = await tabsOf("/blog/moments?topic=gaming")
  const gaming = await run(`(() => ({
    cards: document.querySelectorAll('article').length,
    topics: [...document.querySelectorAll('article span')].map((s) => s.textContent.trim()).filter(Boolean).slice(0, 4),
  }))()`)
  check("筛选「弈趣」只剩 1 条", gaming.cards === 1, JSON.stringify(gaming))

  // 4) 文章详情不应有标签栏
  await cdp.send("Page.navigate", { url: `${BASE}/blog/${article.slug}` })
  await sleep(1600)
  const detailTabs = await run(`Boolean(document.querySelector('nav[aria-label="博客分区"]'))`)
  check("文章详情页没有标签栏", detailTabs === false)

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  for (const id of inserted) db.prepare("delete from Moment where id = ?").run(id)
  db.close()
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
