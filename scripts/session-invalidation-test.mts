/*
 * 验证会话失效修复：账号删除后，同一个 cookie 必须立刻失效。
 *
 * 这是回归测试，会长期保留 —— 因为它防的是一个**静默且危险**的缺口：
 * 删号不生效，被删的账号能一直用下去。
 *
 * 用法：npx tsx scripts/session-invalidation-test.mts
 * 自己启动应用与 mock 邮件服务，跑完自动关闭。
 */
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

/*
 * ⚠️ 用项目自己的 Prisma 客户端，**不要** import better-sqlite3。
 * 它只是 @prisma/adapter-better-sqlite3 的传递依赖，不是直接依赖、
 * 也没有 @types 声明 —— import 它会让 `next build` 的类型检查直接失败
 * （scripts/ 下的文件都在 tsconfig 的 include 里）。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })

const { prisma } = await import("../src/lib/prisma")

const APP_PORT = 3105
const MOCK_PORT = 45893
const APP = `http://127.0.0.1:${APP_PORT}`

let pass = 0
const fail: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

let lastCode = ""
const mock = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    try {
      const b = JSON.parse(raw) as { html: string }
      const m = b.html.match(/letter-spacing:8px[^>]*>(\d{6})</)
      lastCode = m ? m[1] : ""
    } catch {
      /* 忽略 */
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ id: "mock" }))
  })
})
await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", () => r()))

const app = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "next", "start", "-p", String(APP_PORT)],
  {
    env: {
      ...process.env,
      RESEND_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
      RESEND_API_KEY: "re_mock_for_session_test_000",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  }
)
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${APP}/api/auth/email-health`)).ok) break
  } catch {
    /* 还没起来 */
  }
  await sleep(500)
}

function mergeCookie(res: Response, prev = ""): string {
  const jar = new Map<string, string>()
  for (const p of prev.split("; ").filter(Boolean)) {
    const i = p.indexOf("=")
    jar.set(p.slice(0, i), p.slice(i + 1))
  }
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
}

const email = `sessinv-${Date.now()}@test.local`
const name = `会话失效测试${Date.now() % 100000}`
const pwd = "test123456"

// 临时插一首带 apiId 的歌，用来验证「需要登录的接口」确实被拦
const tmpSong = await prisma.song.create({
  data: { title: "__sessinv_tmp__", artist: "t", source: "netease", apiId: "1" },
  select: { id: true },
})
const songId = tmpSong.id

try {
  console.log("\n【1】注册 + 验证 + 登录")
  await fetch(`${APP}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.1" },
    body: JSON.stringify({ name, email, password: pwd }),
  })
  await prisma.emailCode.deleteMany({ where: { email } })
  await fetch(`${APP}/api/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.2" },
    body: JSON.stringify({ email, scene: "register" }),
  })
  const v = await fetch(`${APP}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.3" },
    body: JSON.stringify({ email, code: lastCode }),
  })
  check("邮箱验证通过", v.status === 200, `status=${v.status}`)

  let cookie = ""
  {
    const csrfRes = await fetch(`${APP}/api/auth/csrf`)
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
    cookie = mergeCookie(csrfRes)
    const res = await fetch(`${APP}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ csrfToken, email, password: pwd, callbackUrl: `${APP}/` }),
    })
    cookie = mergeCookie(res, cookie)
    check("登录拿到会话 cookie", /session-token/.test(cookie))
  }

  console.log("\n【2】删除账号前：一切正常（对照组）")
  {
    const s = await (await fetch(`${APP}/api/auth/session`, { headers: { Cookie: cookie } })).json()
    check("会话里有该用户", (s as { user?: { email?: string } })?.user?.email === email)

    const r = await fetch(`${APP}/api/music/play?id=${songId}`, { headers: { Cookie: cookie } })
    check("需要登录的接口放行（不是 401）", r.status !== 401, `status=${r.status}`)
  }

  console.log("\n【3】删除账号")
  {
    const del = await prisma.user.deleteMany({ where: { email } })
    check("账号已从库里删除", del.count === 1, `删除 ${del.count} 行`)
  }

  console.log("\n【4】★★ 删除后：同一个 cookie 必须立刻失效")
  {
    const res = await fetch(`${APP}/api/auth/session`, { headers: { Cookie: cookie } })
    const s = await res.json()
    const hasUser = !!(s as { user?: unknown })?.user
    check("★ /api/auth/session 不再返回用户", !hasUser, JSON.stringify(s).slice(0, 80))

    const r = await fetch(`${APP}/api/music/play?id=${songId}`, { headers: { Cookie: cookie } })
    check("★ 音乐接口被拦（401）", r.status === 401, `status=${r.status}`)
  }

  console.log("\n【5】对照组：没有 cookie 时同样 401")
  {
    const r = await fetch(`${APP}/api/music/play?id=${songId}`)
    check("未登录被拦住（401）", r.status === 401, `status=${r.status}`)
  }

  console.log("\n【6】权限变更仍是即时的（确认没改坏原有行为）")
  {
    // 用一个新账号：登录后把 role 改成 OWNER，会话应立即反映
    const email2 = `sessinv2-${Date.now()}@test.local`
    await fetch(`${APP}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.4" },
      body: JSON.stringify({ name: `权限测试${Date.now() % 100000}`, email: email2, password: pwd }),
    })
    await prisma.emailCode.deleteMany({ where: { email: email2 } })
    await fetch(`${APP}/api/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.5" },
      body: JSON.stringify({ email: email2, scene: "register" }),
    })
    await fetch(`${APP}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.210.0.6" },
      body: JSON.stringify({ email: email2, code: lastCode }),
    })

    let cookie2 = ""
    {
      const csrfRes = await fetch(`${APP}/api/auth/csrf`)
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
      cookie2 = mergeCookie(csrfRes)
      const res = await fetch(`${APP}/api/auth/callback/credentials`, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie2 },
        body: new URLSearchParams({ csrfToken, email: email2, password: pwd, callbackUrl: `${APP}/` }),
      })
      cookie2 = mergeCookie(res, cookie2)
    }

    const before = (await (
      await fetch(`${APP}/api/auth/session`, { headers: { Cookie: cookie2 } })
    ).json()) as { user?: { role?: string } }
    check("新账号初始角色是 READER", before?.user?.role === "READER", before?.user?.role)

    await prisma.user.updateMany({ where: { email: email2 }, data: { role: "OWNER" } })
    const after = (await (
      await fetch(`${APP}/api/auth/session`, { headers: { Cookie: cookie2 } })
    ).json()) as { user?: { role?: string } }
    check("改库后会话立刻反映新角色（权限即时生效未被破坏）", after?.user?.role === "OWNER", after?.user?.role)

    await prisma.user.deleteMany({ where: { email: email2 } })
    await prisma.emailCode.deleteMany({ where: { email: email2 } })
  }
} catch (e) {
  console.error("\n测试出错：", e)
  fail.push(`脚本异常：${(e as Error).message}`)
} finally {
  await prisma.user.deleteMany({ where: { email: { contains: "sessinv" } } })
  await prisma.emailCode.deleteMany({ where: { email: { contains: "sessinv" } } })
  await prisma.song.deleteMany({ where: { title: "__sessinv_tmp__" } })
  await prisma.$disconnect()
  app.kill()
  mock.close()
  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}
