/*
 * 临时：Mermaid 端到端验证
 *  1. 阅读侧：文章里一个 language=mermaid 的代码块 → 渲染成 <svg>
 *  2. 编辑器：点「插入图表」→ 代码块 + 预览图出现
 *  3. 两条路径都不能有 CSP 违规或控制台报错
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"
import Database from "better-sqlite3"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DP = 9400 + Math.floor(Math.random() * 9)
const PORT = 4400 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = ".ui-shots/mermaid"
mkdirSync(OUT, { recursive: true })

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

// ---- 准备一篇带 mermaid 的临时文章 ----
const SLUG = `mermaid-check-${Date.now()}`
const mermaidSource = "flowchart TD\n  A[开始] --> B{判断}\n  B -->|是| C[执行]\n  B -->|否| D[结束]"
const content = JSON.stringify({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "这是一段图表测试正文。" }] },
    { type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: mermaidSource }] },
    { type: "paragraph", content: [{ type: "text", text: "图表之后的正文。" }] },
  ],
})

const db = new Database("dev.db")
const owner = db.prepare("select id from User where role = 'OWNER' limit 1").get()
// Prisma 在 SQLite 里把 DateTime 存成 ISO 字符串（带 +00:00），不是 Date 对象
const now = new Date().toISOString().replace("Z", "+00:00")
const info = db
  .prepare(
    "insert into Article (title, slug, summary, content, published, pinned, viewCount, authorId, createdAt, updatedAt) values (?,?,?,?,?,?,?,?,?,?)"
  )
  .run("图表渲染测试", SLUG, "临时文章，验证后删除", content, 1, 0, 0, owner.id, now, now)
const articleId = info.lastInsertRowid

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })
const edge = spawn(
  EDGE,
  ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DP}`, "--no-first-run", "--user-data-dir=" + process.env.TEMP + "\\edge-mmd-" + Date.now(), "--window-size=1440,1100", "about:blank"],
  { stdio: "ignore" }
)

let cdp
const violations = []
const errors = []
async function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let id = 1
  await new Promise((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = () => rej(new Error("ws"))
  })
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.method === "Log.entryAdded") {
      const e = d.params?.entry
      if (e && /content security policy|refused to/i.test(`${e.text} ${e.source || ""}`)) violations.push(e.text.slice(0, 160))
    }
    if (d.method === "Runtime.consoleAPICalled" && d.params?.type === "error") {
      const txt = (d.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")
      errors.push(txt)
      if (/content security policy|refused to/i.test(txt)) violations.push(txt.slice(0, 160))
    }
    if (d.id && pending.has(d.id)) {
      const { ok, bad } = pending.get(d.id)
      pending.delete(d.id)
      d.error ? bad(new Error(JSON.stringify(d.error))) : ok(d.result)
    }
  }
  return {
    send(method, params = {}) {
      const n = id++
      return new Promise((ok, bad) => {
        pending.set(n, { ok, bad })
        ws.send(JSON.stringify({ id: n, method, params }))
      })
    },
    close: () => ws.close(),
  }
}
const run = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "异常")
  return r.result.value
}

try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) break
    } catch {}
    await sleep(500)
  }
  for (let i = 0; i < 60; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json()
      break
    } catch {
      await sleep(250)
    }
  }
  const target = await (await fetch(`http://127.0.0.1:${DP}/json/new?about:blank`, { method: "PUT" })).json()
  cdp = await connect(target.webSocketDebuggerUrl)
  await cdp.send("Runtime.enable")
  await cdp.send("Page.enable")
  await cdp.send("Network.enable")
  await cdp.send("Log.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })

  // ---------- 1) 阅读侧 ----------
  await cdp.send("Page.navigate", { url: `${BASE}/blog/${SLUG}` })
  let ready = false
  for (let i = 0; i < 120; i++) {
    ready = await run(`Boolean(document.querySelector('.mermaid-diagram[data-state="ready"] svg'))`)
    if (ready) break
    await sleep(250)
  }
  const articleState = await run(`(() => {
    const box = document.querySelector('.mermaid-diagram')
    const svg = box?.querySelector('svg')
    return {
      state: box?.getAttribute('data-state') || null,
      hasSvg: Boolean(svg),
      viewBox: svg?.getAttribute('viewBox') || null,
      nodes: svg ? svg.querySelectorAll('g.node').length : 0,
      // 整段文字（去掉内联 <style> 的内容，只看标签文本）
      text: (Array.from(svg?.querySelectorAll('text, tspan, div') || [])
        .map((el) => el.textContent || '')
        .join('')
        .replace(/\s+/g, '')
        .slice(0, 60) || ''),
      details: Boolean(document.querySelector('.mermaid-source-details')),
      error: (document.querySelector('.mermaid-error-title')?.textContent || '').slice(0, 80),
    }
  })()`)
  check("阅读侧图表渲染成功（svg 出现）", Boolean(articleState.hasSvg), JSON.stringify(articleState))
  check("图里有节点（node 分组 > 0）", Number(articleState.nodes) > 0, `nodes=${articleState.nodes}`)
  check("节点文字进了图里", String(articleState.text).includes("开始") || String(articleState.text).includes("判断"), articleState.text)
  check("图下有「查看源码」折叠", Boolean(articleState.details))
  let shot = await cdp.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(`${OUT}/article.png`, Buffer.from(shot.data, "base64"))

  // ---------- 2) 编辑器 ----------
  const secret = (readFileSync(".env", "utf8").match(/^AUTH_SECRET=(.*)$/m)?.[1] ?? "").trim().replace(/^"|"$/g, "")
  const token = await encode({ token: { sub: String(owner.id), id: String(owner.id), role: "OWNER", permissions: null }, secret, salt: "authjs.session-token" })
  await cdp.send("Network.setCookie", { name: "authjs.session-token", value: token, url: `${BASE}/`, path: "/", httpOnly: true })
  await cdp.send("Page.navigate", { url: `${BASE}/admin/articles/new` })
  await sleep(3500)
  await run(`localStorage.setItem("lankhub.announcement.seen","2099-01-01")`)
  await cdp.send("Page.navigate", { url: `${BASE}/admin/articles/new` })
  await sleep(4000)

  const editorReady = await run(`Boolean(document.querySelector('.tiptap, [contenteditable="true"]'))`)
  check("编辑器已就绪", Boolean(editorReady))

  const clicked = await run(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /插入图表/.test((b.getAttribute('title')||'') + (b.textContent||'')))
    if (!btn) return false
    btn.click()
    return true
  })()`)
  check("找到并点击「插入图表」按钮", Boolean(clicked))

  let previewReady = false
  for (let i = 0; i < 100; i++) {
    previewReady = await run(`Boolean(document.querySelector('.code-block-preview .mermaid-diagram[data-state="ready"] svg'))`)
    if (previewReady) break
    await sleep(250)
  }
  const editorState = await run(`(() => {
    const block = document.querySelector('.code-block')
    const sel = document.querySelector('.code-block-lang-select')
    const box = document.querySelector('.code-block-preview .mermaid-diagram')
    return {
      codeText: (block?.querySelector('.code-block-pre')?.textContent || '').slice(0, 40),
      language: sel?.value || null,
      previewState: box?.getAttribute('data-state') || null,
      hasSvg: Boolean(box?.querySelector('svg')),
      nodes: box ? box.querySelectorAll('svg g.node').length : 0,
      error: (box?.querySelector('.mermaid-error-title')?.textContent || '').slice(0, 80),
    }
  })()`)
  check("插入的是 mermaid 代码块", editorState.language === "mermaid", JSON.stringify(editorState).slice(0, 160))
  check("编辑器预览渲染出图", Boolean(editorState.hasSvg), `state=${editorState.previewState} nodes=${editorState.nodes} err=${editorState.error}`)
  shot = await cdp.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(`${OUT}/editor.png`, Buffer.from(shot.data, "base64"))

  check("全程无 CSP 违规", violations.length === 0, violations.slice(0, 2).join(" | "))
  const noisy = errors.filter((e) => !/favicon|DevTools|React DevTools/i.test(e))
  check("控制台无报错", noisy.length === 0, noisy.slice(0, 2).join(" | ").slice(0, 160))

  cdp.close()
} finally {
  spawn("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" })
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  db.prepare("delete from Article where id = ?").run(articleId)
  db.close()
  await sleep(600)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) {
  fail.forEach((f) => console.log(`  ✗ ${f}`))
  process.exit(1)
}
