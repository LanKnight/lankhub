/*
 * 验证收窄后的令牌边界：
 *   允许：GET/POST /api/admin/articles、GET /api/admin/collections、POST /api/upload
 *   拒绝：DELETE /api/admin/articles/[id]、/api/admin/users、POST /api/admin/collections、
 *         /api/admin/moments、/api/admin/resume …
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import Database from "better-sqlite3"

const PORT = 5598
const BASE = `http://127.0.0.1:${PORT}`
const TOKEN = "0123456789abcdef0123456789abcdef"

let pass = 0
const fail = []
const check = (name, ok, d = "") => {
  ok ? pass++ : fail.push(name)
  console.log(`  ${ok ? "✓" : "✗"} ${name}${d ? ` — ${d}` : ""}`)
}

// 造一篇临时文章供"删除"测试（预期被拒，不会被真删）
const db = new Database("dev.db")
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
const now = new Date().toISOString().replace("Z", "+00:00")
const id = db
  .prepare("insert into Article (title, slug, content, published, authorId, createdAt, updatedAt) values (?,?,?,?,?,?,?)")
  .run(`令牌边界测试 ${Date.now()}`, `token-boundary-${Date.now()}`, JSON.stringify({ type: "doc", content: [] }), 0, owner.id, now, now)
  .lastInsertRowid
db.close()

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  shell: true,
  env: { ...process.env, PUBLISH_TOKEN: TOKEN },
})

const H = { "x-publish-token": TOKEN }

try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + "/")).ok) break
    } catch {}
    await sleep(400)
  }

  const get = (p, headers = {}) => fetch(BASE + p, { headers, redirect: "manual" })

  // ---- 允许的部分 ----
  const list = await get("/api/admin/articles?limit=5", H)
  check("令牌可读文章列表（查重用）", list.status === 200, `HTTP ${list.status}`)

  const collections = await get("/api/admin/collections", H)
  check("令牌可读合集列表（换 id 用）", collections.status === 200, `HTTP ${collections.status}`)

  const upload = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: H,
    body: (() => {
      const form = new FormData()
      form.append("file", new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" }))
      return form
    })(),
  })
  // 这个假 PNG 会被服务端的 magic bytes 校验拒绝（400），但应当**不是** 401
  check("令牌可调用上传接口（未被鉴权拦）", upload.status !== 401 && upload.status !== 403, `HTTP ${upload.status}`)

  // ---- 应当被拒的部分 ----
  const del = await fetch(`${BASE}/api/admin/articles/${id}`, { method: "DELETE", headers: H })
  check("令牌不能删除文章（401）", del.status === 401, `HTTP ${del.status}`)

  const put = await fetch(`${BASE}/api/admin/articles/${id}`, {
    method: "PUT",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "被篡改" }),
  })
  check("令牌不能修改文章（401）", put.status === 401, `HTTP ${put.status}`)

  const users = await get("/api/admin/users", H)
  check("令牌不能看用户列表（401）", users.status === 401, `HTTP ${users.status}`)

  /*
   * 用不存在的用户 id：鉴权通过才会往下走到"用户不存在"（404），
   * 所以 401 = 被挡、404 = 鉴权被绕过。这条用例不会真的改动任何账号。
   */
  const delUser = await fetch(`${BASE}/api/admin/users/999999`, {
    method: "DELETE",
    headers: H,
  })
  check("令牌不能删除用户（401，不是 404）", delUser.status === 401, `HTTP ${delUser.status}`)

  const putUser = await fetch(`${BASE}/api/admin/users/999999`, {
    method: "PUT",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "OWNER" }),
  })
  check("令牌不能改用户（401，不是 404）", putUser.status === 401, `HTTP ${putUser.status}`)

  const collPost = await fetch(`${BASE}/api/admin/collections`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "令牌不该能建合集" }),
  })
  check("令牌不能新建合集（401）", collPost.status === 401, `HTTP ${collPost.status}`)

  const moments = await get("/api/admin/moments", H)
  check("令牌不能访问动态管理（401）", moments.status === 401, `HTTP ${moments.status}`)

  const resume = await get("/api/admin/resume", H)
  check("令牌不能访问简历接口（401）", resume.status === 401, `HTTP ${resume.status}`)

  // ---- 无令牌对照 ----
  const anon = await get("/api/admin/articles?limit=5")
  check("不带令牌仍是 401", anon.status === 401, `HTTP ${anon.status}`)
} finally {
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  const cleanup = new Database("dev.db")
  cleanup.prepare("delete from Article where id = ?").run(id)
  cleanup.close()
  await sleep(400)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) {
  fail.forEach((f) => console.log(`  ✗ ${f}`))
  process.exit(1)
}
