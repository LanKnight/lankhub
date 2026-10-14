/*
 * 用 Edge 的 DevTools 协议检查页面：真实渲染 + 收集 console 错误与页面异常。
 *
 * 为什么不用 --dump-dom：
 *  1) PowerShell 里拼中文与引号极易出错（已经栽过两次）
 *  2) --dump-dom 只给 HTML，看不到运行时异常与 console.error
 *     —— 而 React 的 hydration 错误、客户端组件的报错恰恰只在 console 里
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { createServer } from "node:http"
import { writeFileSync, mkdirSync } from "node:fs"

mkdirSync(".ui-shots", { recursive: true })

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PORT = 9222
const APP_PORT = 3100
const BASE = `http://127.0.0.1:${APP_PORT}`
const MOCK_PORT = 45889

const PAGES = [
  { path: "/auth/login", expect: "欢迎回来", mustHave: ["密码登录", "验证码登录", "Resend"] },
  { path: "/auth/register", expect: "创建账号", mustHave: ["昵称", "邮箱", "下一步：验证邮箱", "Resend"] },
  { path: "/auth/forgot-password", expect: "忘记密码", mustHave: ["发送重置验证码", "Resend"] },
]

let pass = 0
const fail = []
/** 注册交互里用到的邮箱，测试结束后删掉，避免污染数据库 */
let usedEmail = null
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

/*
 * 应用与 mock 邮件服务都由本脚本自己起、自己停。
 *
 * 为什么不靠外部先启动好：那样脚本的结果依赖「上一条命令有没有成功」
 * —— 实测踩过：上一条 PowerShell 命令因引号解析错误整条没执行，
 * 这次检查就全部报 ERR_CONNECTION_REFUSED，看起来像页面坏了，
 * 实际只是没服务。把生命周期收进脚本，检查结果才只反映被测对象。
 */
const mock = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ id: "mock" }))
  })
})
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r))

const app = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "next", "start", "-p", String(APP_PORT)],
  {
    env: {
      ...process.env,
      RESEND_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
      RESEND_API_KEY: "re_mock_for_ui_check_only_0000",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  }
)

/** 等服务就绪 */
async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/email-health`)
      if (r.ok) return true
    } catch {
      /* 还没起来 */
    }
    await sleep(500)
  }
  return false
}

/** 连到 DevTools，返回 { send, close } */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const events = []
  let nextId = 1

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = (e) => reject(new Error(`WebSocket 连接失败: ${e.message ?? e}`))
  })

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result)
    } else if (data.method) {
      events.push(data)
    }
  }

  return {
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`${method} 超时`))
          }
        }, 15000)
      })
    },
    events,
    close: () => ws.close(),
  }
}

/**
 * 判断一个「请求失败」是否属于正常现象，不该算问题。
 *
 * 只放过两类，其余一律报出来 —— 宁可偶尔多报，也不要漏掉真实故障：
 *   1) ERR_ABORTED + 带 `_rsc=` 的请求：Next.js 的 RSC 预取被浏览器取消
 *   2) ERR_ABORTED + 导航类请求：浏览器在 `Page.navigate` 时取消上一个文档的请求
 */
function isBenignAbort(errorText, url) {
  if (errorText !== "net::ERR_ABORTED") return false
  if (url.includes("_rsc=")) return true
  return false
}

// ---- 启动 Edge ----
const appReady = await waitForApp()
if (!appReady) {
  console.error(`应用没能在 ${APP_PORT} 端口起来，无法检查页面`)
  app.kill()
  mock.close()
  process.exit(1)
}
console.log(`应用已就绪：${BASE}\n`)

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\edge-diag-profile",
    "about:blank",
  ],
  { stdio: "ignore" }
)

// 等 DevTools 端口就绪
let version = null
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    version = await r.json()
    break
  } catch {
    await sleep(250)
  }
}

try {
  if (!version) throw new Error("Edge 的 DevTools 端口没起来")
  console.log(`已连接浏览器：${version.Browser}\n`)

  for (const page of PAGES) {
    console.log(`【${page.path}】`)

    // 每个页面用一个新 target，避免上一个页面的错误串到下一个
    const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
    const target = await targetRes.json()
    const cdp = await connect(target.webSocketDebuggerUrl)

    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []
    /** requestId → url，用于把 loadingFailed 定位到具体资源 */
    const requestUrls = new Map()

    // 监听事件：console / 异常 / 请求失败
    cdp.send("Runtime.enable")
    cdp.send("Log.enable")
    cdp.send("Network.enable")

    try {
      await cdp.send("Page.enable")
      await cdp.send("Page.navigate", { url: `${BASE}${page.path}` })
      // 等加载与 React 渲染
      await sleep(3500)

      // 收集事件
      for (const e of cdp.events) {
        if (e.method === "Network.requestWillBeSent") {
          requestUrls.set(e.params.requestId, e.params.request.url)
        }
        if (e.method === "Runtime.exceptionThrown") {
          pageErrors.push(e.params.exceptionDetails?.exception?.description ?? "未知异常")
        }
        if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") {
          consoleErrors.push(
            e.params.args.map((a) => a.value ?? a.description ?? "").join(" ")
          )
        }
        if (e.method === "Log.entryAdded" && e.params.entry.level === "error") {
          consoleErrors.push(e.params.entry.text)
        }
        if (e.method === "Network.loadingFailed") {
          /*
           * 记下是哪个请求失败了：只有 URL 才能判断 ERR_ABORTED 是
           * 「导航/预取取消」这种正常现象，还是真的有资源加载不到。
           *
           * 实测：失败的是 /blog?_rsc=... —— 导航栏里 /blog 链接的
           * Next.js 预取请求，页面加载完成后浏览器主动取消它。
           * 这属于正常行为，不该报成问题。
           */
          const url = requestUrls.get(e.params.requestId) ?? "(未知)"
          if (isBenignAbort(e.params.errorText, url)) continue
          failedRequests.push(`${e.params.errorText} ${url}`)
        }
      }

      // 取渲染结果
      const evalRes = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          h1: document.querySelector("h1")?.textContent ?? null,
          body: document.body.innerText,
          hasErrorOverlay: !!document.querySelector("nextjs-portal"),
          inputs: document.querySelectorAll("input").length,
          buttons: [...document.querySelectorAll("button")].map(b => b.textContent.trim()),
        })`,
        returnByValue: true,
      })
      const info = JSON.parse(evalRes.result.value)

      // 顺手截图，便于人工看一眼版式（存到 .ui-shots/，该目录已被 gitignore）
      try {
        /*
         * 截图前把视口调高，否则只能看到首屏 —— 免责声明、按钮这些
         * 在页面下半部分的东西看不到，截图就起不到「人工确认」的作用
         * （第一版就是 750×485，登录页的免责声明被截掉了）。
         */
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: 900,
          height: 1100,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await sleep(300)
        const shot = await cdp.send("Page.captureScreenshot", { format: "png" })
        // ⚠️ 目录与文件名之间的 `/` 不能漏。第一版写成
        // `.ui-shots${path.replace(...)}`，结果生成的是 `.ui-shots-auth-login.png`
        // 这种**前缀式文件**（在仓库根目录下），而 .gitignore 里的 `.ui-shots/`
        // 只匹配目录，挡不住它们 —— 差一点就提交进仓库了。
        const fileName = page.path.replace(/^\//, "").replace(/\//g, "-")
        writeFileSync(`.ui-shots/${fileName}.png`, Buffer.from(shot.data, "base64"))
        await cdp.send("Emulation.clearDeviceMetricsOverride")
      } catch {
        /* 截图失败不影响断言 */
      }

      check("页面正常渲染出标题", info.h1 === page.expect, `实际 h1="${info.h1}"`)
      check("没有 Next.js 错误覆盖层", !info.hasErrorOverlay)
      check("没有未捕获的运行时异常", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200))
      check("没有 console 错误", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 200))
      check(
        "没有失败的资源请求",
        failedRequests.length === 0,
        failedRequests.join(", ").slice(0, 120)
      )

      for (const text of page.mustHave) {
        check(`包含「${text}」`, info.body.includes(text))
      }

      console.log(`     input ${info.inputs} 个 · button: ${info.buttons.join(" / ")}`)

      // ---------- 交互测试 ----------
      async function evaluate(expression) {
        const r = await cdp.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        })
        if (r.exceptionDetails) {
          throw new Error(r.exceptionDetails.exception?.description ?? "evaluate 异常")
        }
        return r.result.value
      }

      /** 在某个输入框里模拟逐字输入（触发 React 的 onChange） */
      const typeInto = (selector, text) => `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return "找不到元素";
        const setter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          "value"
        ).set;
        setter.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return "ok";
      })()`

      if (page.path === "/auth/login") {
        // ① 切到「验证码登录」后应出现 6 格验证码输入
        //
        // 注意：邮箱输入框是**两个标签页共享**的，所以总数是
        // 「2 个（邮箱 + 密码）」→「7 个（邮箱 + 6 格验证码）」，
        // 不是 2 → 8。第一版断言写成 before + 6，假失败了一次。
        const before = await evaluate(`document.querySelectorAll('input').length`)
        await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('验证码登录')).click()`)
        await sleep(400)
        const after = await evaluate(`document.querySelectorAll('input').length`)
        const codeBoxes = await evaluate(
          `document.querySelectorAll('input[inputmode="numeric"]').length`
        )
        check("切到验证码登录后出现 6 格验证码输入", codeBoxes === 6, `共 ${after} 个输入框，其中验证码 ${codeBoxes} 格`)
        check("密码输入框已隐藏（不会同时出现两种登录方式）", after === before - 1 + 6, `${before} → ${after}`)
        check(
          "验证码格带 inputMode=numeric（手机弹数字键盘）",
          await evaluate(`document.querySelectorAll('input[inputmode="numeric"]').length === 6`)
        )
        check(
          "第一格带 one-time-code（可从邮件自动填充）",
          await evaluate(`document.querySelector('input[autocomplete="one-time-code"]') !== null`)
        )

        // ② 逐位输入应自动跳到下一格
        await evaluate(typeInto('input[inputmode="numeric"]', "1"))
        await sleep(250)
        const focusedIdx = await evaluate(
          `[...document.querySelectorAll('input[inputmode="numeric"]')].indexOf(document.activeElement)`
        )
        check("输入第 1 位后焦点自动跳到第 2 格", focusedIdx === 1, `焦点在第 ${focusedIdx + 1} 格`)

        // ③ 粘贴整串应一次铺开 6 位
        await evaluate(`(() => {
          const el = document.querySelectorAll('input[inputmode="numeric"]')[0];
          el.focus();
          const dt = new DataTransfer();
          dt.setData("text/plain", "123456");
          el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          return "ok";
        })()`)
        await sleep(400)
        const filled = await evaluate(
          `[...document.querySelectorAll('input[inputmode="numeric"]')].map(i => i.value).join("")`
        )
        check("粘贴整串验证码能一次填满 6 格", filled === "123456", `实际="${filled}"`)
      }

      if (page.path === "/auth/register") {
        /*
         * ⚠️ 每次运行用**唯一**邮箱。
         * 第一版写死了 interact@test.local，结果第二次运行时该邮箱已注册，
         * 服务端正确地返回 409「该邮箱已注册」，界面就停在第一步 ——
         * 断言失败，但**被测行为其实是对的**，纯粹是测试自己不干净。
         */
        const testEmail = `ui-check-${Date.now()}@test.local`
        usedEmail = testEmail

        // ① 两次密码不一致要拦住
        await evaluate(typeInto("#name", `交互测试${Date.now() % 10000}`))
        await evaluate(typeInto("#email", testEmail))
        await evaluate(typeInto("#password", "test123456"))
        await evaluate(typeInto("#confirmPassword", "different999"))
        await evaluate(`document.querySelector('button[type="submit"]').click()`)
        await sleep(400)
        const bodyAfterMismatch = await evaluate(`document.body.innerText`)
        check("两次密码不一致时给出提示且不提交", bodyAfterMismatch.includes("两次输入的密码不一致"))

        // ② 密码太短也要拦住
        await evaluate(typeInto("#password", "123"))
        await evaluate(typeInto("#confirmPassword", "123"))
        await evaluate(`document.querySelector('button[type="submit"]').click()`)
        await sleep(400)
        check(
          "密码过短时给出提示",
          (await evaluate(`document.body.innerText`)).includes("至少")
        )

        // ③ 正常提交 → 应进入第二步（出现验证码输入）
        await evaluate(typeInto("#password", "test123456"))
        await evaluate(typeInto("#confirmPassword", "test123456"))
        await evaluate(`document.querySelector('button[type="submit"]').click()`)
        await sleep(2500)
        const step2Body = await evaluate(`document.body.innerText`)
        const step2Title = await evaluate(`document.querySelector("h1")?.textContent ?? ""`)
        check(
          "★ 提交成功后进入「验证邮箱」第二步",
          step2Title.includes("验证邮箱"),
          `h1="${step2Title}"`
        )
        check(
          "第二步显示邮箱地址，便于用户核对自己填对了没",
          step2Body.includes(testEmail),
          ""
        )
        check(
          "第二步出现 6 格验证码输入",
          (await evaluate(`document.querySelectorAll('input[inputmode="numeric"]').length`)) === 6
        )
      }
    } finally {
      cdp.close()
      await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {})
    }
    console.log("")
  }
} catch (error) {
  console.error("检查出错：", error.message)
  fail.push(`脚本异常：${error.message}`)
} finally {
  edge.kill()
  app.kill()
  mock.close()

  // 清理交互测试造出来的账号与验证码记录
  if (usedEmail) {
    try {
      const Database = (await import("better-sqlite3")).default
      const db = new Database("dev.db")
      const u = db.prepare("delete from User where email = ?").run(usedEmail)
      db.prepare("delete from EmailCode where email = ?").run(usedEmail)
      console.log(`\n已清理测试账号 ${usedEmail}（${u.changes} 行）`)
      db.close()
    } catch (e) {
      console.log(`清理测试账号失败：${e.message}`)
    }
  }

  console.log(`===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    for (const f of fail) console.log(`  - ${f}`)
    process.exitCode = 1
  }
}
