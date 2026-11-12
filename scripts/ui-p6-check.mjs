/*
 * P6 验收：重定向 / sitemap / 旧路由下线 / 公告
 * 只看 HTTP 层面，不需要浏览器。
 */
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

const PORT = 5200 + Math.floor(Math.random() * 60)
const BASE = `http://127.0.0.1:${PORT}`

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const app = spawn("npx.cmd", ["--no-install", "next", "start", "-p", String(PORT)], { stdio: "ignore", shell: true })

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).ok) break } catch {} await sleep(500) }

  const redirectOf = async (path) => {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" })
    return { status: res.status, location: res.headers.get("location") }
  }

  const cases = [
    ["/photos", "/blog/moments"],
    ["/photos/programming", "/blog/moments?topic=programming"],
    ["/photos/music", "/music"],
    ["/poems", "/blog/moments?kind=poem"],
  ]
  for (const [from, to] of cases) {
    const r = await redirectOf(from)
    const isRedirect = r.status === 308 || r.status === 301 || r.status === 307
    check(`${from} 永久重定向到 ${to}`, isRedirect && (r.location ?? "").endsWith(to), `${r.status} → ${r.location}`)
  }

  // sitemap
  const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text())
  check("sitemap 含 /blog/moments", sitemap.includes("/blog/moments"))
  check("sitemap 含 /blog/collections", sitemap.includes("/blog/collections"))
  check("sitemap 不含 /photos/", !sitemap.includes("/photos/"))
  check("sitemap 不含 /poems", !sitemap.includes("/poems"))
  check("sitemap 仍含文章详情", /\/blog\/[a-z0-9-]+/.test(sitemap))

  // 旧后台已下线
  for (const path of ["/admin/photos", "/admin/poems"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" })
    check(`旧后台 ${path} 已下线（404）`, res.status === 404, `HTTP ${res.status}`)
  }

  /*
   * 公告是客户端组件（要读 localStorage 判断"看没看过"），SSR 的 HTML 里不含那段文案，
   * 所以这里直接校验数据文件本身：版本号 + 两条最近更新 + 不超过两条。
   */
  const announcementSrc = readFileSync("src/lib/announcement.ts", "utf8")
  check(
    "公告版本号已更新",
    /ANNOUNCEMENT_VERSION\s*=\s*"2026-11-12"/.test(announcementSrc)
  )
  check(
    "公告含新的两条最近更新",
    announcementSrc.includes("站点挪了位置") && announcementSrc.includes("相册和诗句都搬进了博客")
  )
  const listBlock = announcementSrc.match(/list:\s*\[([\s\S]*?)\]/)
  const listItems = listBlock ? listBlock[1].split("\n").filter((line) => line.trim().startsWith('"')) : []
  check("「最近更新」恰好两条", listItems.length === 2, `条数=${listItems.length}`)

  // 动态页与博客页可访问
  for (const path of ["/blog", "/blog/moments", "/blog/collections", "/resume"]) {
    const res = await fetch(`${BASE}${path}`)
    check(`${path} 正常 200`, res.status === 200, `HTTP ${res.status}`)
  }
} finally {
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" })
  await sleep(500)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
