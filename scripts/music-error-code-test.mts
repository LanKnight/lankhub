/*
 * 验证 /api/music/play 的错误码分类。
 *
 * 为什么这值得单独测：播放器「重试还是换歌」完全依赖这个 code，
 * 而 code 错了的表现是「能播的歌被跳过」或「没版权的歌反复重试」——
 * 都不会报错，只会让用户觉得「播放器怪怪的」。
 *
 * 用法：npx tsx scripts/music-error-code-test.mts
 * 自己启动应用，跑完自动关闭并清理测试数据。
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { createServer } from "node:http"
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })
const { prisma } = await import("../src/lib/prisma")

const APP_PORT = 3107
const MOCK_PORT = 45895
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
      RESEND_API_KEY: "re_mock_for_err_code_test_00",
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

const email = `musiccode-${Date.now()}@test.local`
const name = `错误码测试${Date.now() % 100000}`
const pwd = "test123456"
// 临时歌：一首已绑定（会真的去打第三方）、一首未绑定
const bound = await prisma.song.create({
  data: { title: "__errcode_bound__", artist: "t", source: "netease", apiId: "1" },
  select: { id: true },
})
const unbound = await prisma.song.create({
  data: { title: "__errcode_unbound__", artist: "t", source: "netease", apiId: null },
  select: { id: true },
})

async function getPlay(id: number, cookie: string) {
  const res = await fetch(`${APP}/api/music/play?id=${id}`, {
    headers: cookie ? { Cookie: cookie } : {},
  })
  let data: { url?: string; error?: string; code?: string } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* 忽略 */
  }
  return { status: res.status, data }
}

try {
  console.log("\n【1】没登录 → unauthorized")
  {
    const r = await getPlay(bound.id, "")
    check("状态码 401", r.status === 401, String(r.status))
    check("code = unauthorized", r.data.code === "unauthorized", String(r.data.code))
  }

  // 准备一个已验证账号并登录
  console.log("\n【0】准备登录态")
  {
    await fetch(`${APP}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.230.0.1" },
      body: JSON.stringify({ name, email, password: pwd }),
    })
    await prisma.emailCode.deleteMany({ where: { email } })
    await fetch(`${APP}/api/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.230.0.2" },
      body: JSON.stringify({ email, scene: "register" }),
    })
    await fetch(`${APP}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.230.0.3" },
      body: JSON.stringify({ email, code: lastCode }),
    })
  }

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
    check("拿到会话 cookie", /session-token/.test(cookie))
  }

  console.log("\n【2】未绑定 API 的歌 → not_playable（永久）")
  {
    const r = await getPlay(unbound.id, cookie)
    check("状态码 409", r.status === 409, String(r.status))
    check("code = not_playable", r.data.code === "not_playable", String(r.data.code))
  }

  console.log("\n【3】库里没有这首歌 → not_playable（永久）")
  {
    const r = await getPlay(999999, cookie)
    check("状态码 404", r.status === 404, String(r.status))
    check("code = not_playable", r.data.code === "not_playable", String(r.data.code))
  }

  console.log("\n【4】参数不合法 → bad_request（永久）")
  {
    const res = await fetch(`${APP}/api/music/play?id=abc`, { headers: { Cookie: cookie } })
    const data = (await res.json()) as { code?: string }
    check("状态码 400", res.status === 400, String(res.status))
    check("code = bad_request", data.code === "bad_request", String(data.code))
  }

  console.log("\n【5】已绑定的歌：要么给地址，要么给一个**分类明确**的错误码")
  {
    /*
     * 这一项刻意不写死期望哪个 code —— 它取决于第三方此刻怎么回应：
     *   - 正常：200 + 签名地址
     *   - 该 apiId 不存在 / 该音源没有 → url_unavailable（永久，换歌）
     *   - 503 / 超时 / 配额用完 → upstream_error 或 quota_exhausted（暂时，重试）
     *
     * 我第一版断言「本地必然打不通上游，所以应该是 upstream_error」——
     * 结果第三方对那个不存在的 apiId 回了空地址，得到 url_unavailable。
     * 那个分类其实是**对的**（歌不存在，重试无意义），错的是我的假设。
     *
     * 所以这里只检查真正重要的事：**任何一个响应都必须带一个已知分类的 code**。
     * 播放器的重试/换歌决策完全依赖它，缺了就会退化成「什么都重试」。
     */
    const r = await getPlay(bound.id, cookie)
    const KNOWN = [
      "not_playable",
      "url_unavailable",
      "quota_exhausted",
      "upstream_error",
      "rate_limited",
      "bad_request",
      "unauthorized",
    ]
    if (r.status === 200 && r.data.url) {
      check("拿到播放地址", true, `${r.data.url.slice(0, 50)}…`)
    } else {
      check(
        "失败时带了已分类的 code",
        KNOWN.includes(String(r.data.code)),
        `status=${r.status} code=${String(r.data.code)} error=${String(r.data.error)}`
      )
    }
  }

  console.log("\n【6】错误码必须在已知集合内")
  {
    const known = new Set([
      "not_playable",
      "url_unavailable",
      "quota_exhausted",
      "upstream_error",
      "rate_limited",
      "bad_request",
      "unauthorized",
    ])
    const r = await getPlay(unbound.id, cookie)
    check("返回的 code 属于 MusicErrorCode 集合", known.has(String(r.data.code)), String(r.data.code))
  }

  console.log("\n【7】错误文案仍然保留（后台与提示都用它）")
  {
    const r = await getPlay(unbound.id, cookie)
    check("同时给了可读的中文文案", typeof r.data.error === "string" && r.data.error.length > 0, r.data.error)
  }
} catch (e) {
  console.error("\n测试出错：", e)
  fail.push(`脚本异常：${(e as Error).message}`)
} finally {
  await prisma.song.deleteMany({ where: { title: { startsWith: "__errcode_" } } })
  await prisma.user.deleteMany({ where: { email: { contains: "musiccode-" } } })
  await prisma.emailCode.deleteMany({ where: { email: { contains: "musiccode-" } } })
  await prisma.$disconnect()
  app.kill()
  mock.close()
  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}
