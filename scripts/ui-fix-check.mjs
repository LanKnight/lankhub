/*
 * 本轮修复的验收：权限（文章/动态）+ 上传压缩 + 瀑布流不裁切 + 点击放大
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9600 + Math.floor(Math.random() * 9)
const PORT = 5300 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/fix"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

// ---------- 造数据：三个读者（moment / 旧码 photo / 无权限）+ 一条多图动态 ----------
const db = new Database("dev.db")
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
const now = new Date().toISOString().replace("Z", "+00:00")
const ts = Date.now()

const mkUser = db.prepare(
  "insert into User (email,password,name,role,permissions,createdAt,updatedAt) values (?,?,?,?,?,?,?)"
)
const momentUser = mkUser.run(`tmp-moment-${ts}@test.local`, "x", `tmpmoment${ts}`, "READER", "moment", now, now).lastInsertRowid
const legacyUser = mkUser.run(`tmp-legacy-${ts}@test.local`, "x", `tmplegacy${ts}`, "READER", "photo", now, now).lastInsertRowid
const noneUser = mkUser.run(`tmp-none-${ts}@test.local`, "x", `tmpnone${ts}`, "READER", null, now, now).lastInsertRowid
const articleUser = mkUser.run(`tmp-article-${ts}@test.local`, "x", `tmparticle${ts}`, "READER", "article", now, now).lastInsertRowid

// 一条带 3 张不同比例图的动态（宽高都写对，用来验证瀑布流不裁切）
const svg = (w, h, label) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#cfd8dc"/><text x="${w / 2}" y="${h / 2}" font-size="${Math.round(w / 8)}" text-anchor="middle" fill="#607d8b">${label}</text></svg>`
  ).toString("base64")

const momentId = db
  .prepare(
    "insert into Moment (kind,topic,title,text,published,sortOrder,authorId,createdAt,updatedAt) values ('moment','programming','瀑布流验证','三张不同比例的图',1,99999,?,?,?)"
  )
  .run(owner.id, now, now).lastInsertRowid
const insertImage = db.prepare("insert into MomentImage (momentId,url,width,height,sortOrder) values (?,?,?,?,?)")
insertImage.run(momentId, svg(900, 1600, "P"), 900, 1600, 0)
insertImage.run(momentId, svg(1600, 900, "L"), 1600, 900, 1)
insertImage.run(momentId, svg(1000, 1000, "S"), 1000, 1000, 2)
db.close()

const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
const tokenFor = (id, role, permissions) =>
  encode({ token: { sub: String(id), id: String(id), role, permissions }, secret, salt: "authjs.session-token" })

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-fix-" + Date.now(), "--window-size=1440,1200", "about:blank"], { stdio: "ignore" })

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
const cookieOf = async (id, role, permissions) => `authjs.session-token=${await tokenFor(id, role, permissions)}`

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }

  // ---------- A. 权限矩阵（HTTP 层） ----------
  const ownerCookie = await cookieOf(owner.id, "OWNER", null)
  const momentCookie = await cookieOf(momentUser, "READER", "moment")
  const legacyCookie = await cookieOf(legacyUser, "READER", "photo")
  const noneCookie = await cookieOf(noneUser, "READER", null)
  const articleCookie = await cookieOf(articleUser, "READER", "article")

  const get = async (path, cookie) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" })
    return { status: res.status, location: res.headers.get("location"), body: await res.text() }
  }

  const mList = await get("/admin/moments", momentCookie)
  check("有「动态管理」权限能看到动态管理页内容", mList.status === 200 && mList.body.includes("新建动态"), `HTTP ${mList.status}`)
  check("该用户侧栏没有「文章管理」入口", !mList.body.includes('href="/admin/articles"'))

  const mLegacy = await get("/admin/moments", legacyCookie)
  check("旧码 photo 被当成 moment（不会把人锁在外面）", mLegacy.status === 200 && mLegacy.body.includes("新建动态"), `HTTP ${mLegacy.status}`)

  /*
   * Next 的流式重定向会先回 200、再由客户端跳转，所以不能只看状态码。
   * 这里跟随后看落地页，并断言"动态管理页面的内容"没有被渲染出来（这才是安全要点）。
   */
  const nFollow = await fetch(`${BASE}/admin/moments`, { headers: { cookie: noneCookie }, redirect: "follow" })
  const nBody = await nFollow.text()
  check(
    "无权限用户看不到动态管理内容（被挡走）",
    !nBody.includes("新建动态"),
    `落地 ${new URL(nFollow.url).pathname}`
  )

  const mArticles = await get("/admin/articles", momentCookie)
  check("只有动态权限时进不了文章模块（看不到「新建文章」）", !mArticles.body.includes("新建文章"), `HTTP ${mArticles.status}`)

  const aList = await get("/admin/articles", articleCookie)
  check("只有文章权限时能进文章模块", aList.body.includes("新建文章"), `HTTP ${aList.status}`)
  check("只有文章权限时侧栏没有「动态管理」入口", !aList.body.includes('href="/admin/moments"'))

  const postMoment = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: momentCookie },
    body: JSON.stringify({ kind: "moment", text: "权限测试：读者发布的动态" }),
  })
  const created = await postMoment.json().catch(() => null)
  check("有权限的读者能调发布接口（201）", postMoment.status === 201, `HTTP ${postMoment.status}`)

  const postNone = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: noneCookie },
    body: JSON.stringify({ kind: "moment", text: "应该被拒" }),
  })
  check("无权限读者调发布接口被拒（403）", postNone.status === 403, `HTTP ${postNone.status}`)

  const postOwner = await fetch(`${BASE}/api/admin/moments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ kind: "moment", text: "站长仍然可以发" }),
  })
  check("站长仍然可以发动态（201）", postOwner.status === 201, `HTTP ${postOwner.status}`)

  // 清理这两条测试动态
  for (const id of [created?.id].filter(Boolean)) {
    await fetch(`${BASE}/api/admin/moments/${id}`, { method: "DELETE", headers: { cookie: ownerCookie } })
  }
  const postOwnerData = await postOwner.json().catch(() => null)
  if (postOwnerData?.id) {
    await fetch(`${BASE}/api/admin/moments/${postOwnerData.id}`, { method: "DELETE", headers: { cookie: ownerCookie } })
  }

  // ---------- B. 瀑布流不裁切（浏览器） ----------
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); break } catch { await sleep(250) } }
  const t = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(t.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false })
  await cdp.send("Page.navigate", { url: `${BASE}/` })
  await sleep(1200)
  await run(`localStorage.setItem("lankhub.announcement.seen","2026-11-12")`)

  await cdp.send("Page.navigate", { url: `${BASE}/blog/moments` })
  await sleep(2200)
  const layout = await run(`(() => {
    const card = [...document.querySelectorAll('article')].find((a) => a.textContent.includes('瀑布流验证'))
    if (!card) return { found: false }
    const columns = [...card.querySelectorAll('[data-gallery-column]')]
    const container = columns[0]?.parentElement ?? null
    const imgs = [...card.querySelectorAll('img')]
    return {
      found: true,
      hasMasonry: Boolean(container),
      columnCount: columns.length,
      emptyColumns: columns.filter((el) => el.children.length === 0).length,
      imgs: imgs.map((img) => {
        const rect = img.getBoundingClientRect()
        return {
          natural: [img.naturalWidth, img.naturalHeight],
          shown: [Math.round(rect.width), Math.round(rect.height)],
          objectFit: getComputedStyle(img).objectFit,
        }
      }),
    }
  })()`)
  check("找到多图动态且用了多列容器", layout.found && layout.hasMasonry, JSON.stringify(layout).slice(0, 160))
  check("桌面是 3 列", String(layout.columnCount) === "3", String(layout.columnCount))
  check("每一列都有图片（没有空列）", layout.emptyColumns === 0, `空列 ${layout.emptyColumns}`)
  const cropped = (layout.imgs || []).filter((img) => {
    const [nw, nh] = img.natural
    const [sw, sh] = img.shown
    if (!nw || !nh || !sw || !sh) return true
    return Math.abs(nw / nh - sw / sh) > 0.03
  })
  check("三张图都按原比例显示（没有被裁）", cropped.length === 0, `不一致 ${cropped.length} 张: ${JSON.stringify(cropped)}`)
  await shot("moments-masonry")

  // ---------- C. 点击放大 ----------
  await run(`(() => {
    const card = [...document.querySelectorAll('article')].find((a) => a.textContent.includes('瀑布流验证'))
    card?.querySelector('button[aria-label^="查看第"]')?.click()
    return true
  })()`)
  await sleep(500)
  const lightbox = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="查看图片"]')
    if (!dialog) return { open: false }
    return {
      open: true,
      counter: [...dialog.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /\\d+ \\/ \\d+/.test(t)) || null,
      hasPrev: Boolean(dialog.querySelector('button[aria-label="上一张"]')),
      hasNext: Boolean(dialog.querySelector('button[aria-label="下一张"]')),
      imgFit: getComputedStyle(dialog.querySelector('img')).objectFit,
    }
  })()`)
  check("点图打开放大层", lightbox.open, JSON.stringify(lightbox))
  check("放大层是完整显示（object-contain）", lightbox.imgFit === "contain", String(lightbox.imgFit))
  check("多图时有上一张/下一张与计数", lightbox.hasPrev && lightbox.hasNext && /\/\s*3/.test(lightbox.counter || ""), JSON.stringify(lightbox.counter))
  await shot("lightbox")

  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 })
  await sleep(300)
  const afterRight = await run(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="查看图片"]')
    return [...dialog.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /\\d+ \\/ \\d+/.test(t)) || null
  })()`)
  check("按→能切到下一张", /^2\s*\/\s*3$/.test(afterRight || ""), String(afterRight))

  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(300)
  check("Esc 关闭放大层", await run(`!document.querySelector('[role="dialog"][aria-label="查看图片"]')`))

  // ---------- D. 上传压缩（浏览器里造一张大图，走真实上传） ----------
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: await tokenFor(owner.id, "OWNER", null), url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/admin/moments/new` })
  await sleep(2500)

  const injected = await run(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    const image = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (i * 7) % 255
      image.data[i + 1] = (i * 13) % 255
      image.data[i + 2] = (i * 29) % 255
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], 'big-test.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]')
    if (!input) return { ok: false, reason: 'no input' }
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, originalSize: file.size }
  })()`)
  check("页面里造出大图并触发上传", Boolean(injected.ok), JSON.stringify(injected))

  let uploaded = null
  for (let i = 0; i < 80; i++) {
    uploaded = await run(`(() => {
      const img = document.querySelector('/admin/moments/new' ? 'img' : 'img')
      const imgs = [...document.querySelectorAll('img')].filter((el) => (el.getAttribute('src') || '').includes('/api/images/'))
      const target = imgs[imgs.length - 1]
      return target ? { src: target.getAttribute('src'), natural: [target.naturalWidth, target.naturalHeight] } : null
    })()`)
    if (uploaded) break
    await sleep(500)
  }
  check("上传成功并出现预览", Boolean(uploaded?.src), JSON.stringify(uploaded))

  if (uploaded?.src) {
    const stat = await run(`(async () => {
      const res = await fetch(${JSON.stringify(uploaded.src)})
      const blob = await res.blob()
      return { size: blob.size, type: blob.type }
    })()`)
    const isWebp = String(uploaded.src).endsWith(".webp")
    const smaller = stat.size < injected.originalSize
    check("上传的是压缩后的 webp", isWebp, uploaded.src)
    check(
      "压缩后体积明显变小且 < 1MB",
      smaller && stat.size < 1024 * 1024,
      `原始 ${(injected.originalSize / 1024).toFixed(0)}KB → 压缩后 ${(stat.size / 1024).toFixed(0)}KB (${stat.type})`
    )
  }

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  const cleanup = new Database("dev.db")
  cleanup.prepare("delete from MomentImage where momentId = ?").run(momentId)
  cleanup.prepare("delete from Moment where id = ?").run(momentId)
  for (const id of [momentUser, legacyUser, noneUser, articleUser]) cleanup.prepare("delete from User where id = ?").run(id)
  cleanup.close()
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
