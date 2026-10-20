/*
 * 真实浏览器验证：把 Markdown 粘进文章编辑器后，DOM 到底变成了什么。
 *
 * ## 为什么必须有这个测试
 *
 * `scripts/markdown-paste-test.mts` 只覆盖纯函数（识别规则、图片改写、安全清洗）。
 * 但「@tiptap/markdown 在咱们这套扩展下能不能正确产出 <h2>/<table>/<pre>」
 * 是纯函数测不到的 —— 它依赖：
 *   - 自定义代码块扩展（CodeBlockWithTools）能否接收 markdown 的 language
 *   - TableKit 的 parseMarkdown 能否对上 schema
 *   - insertContent 会不会把节点塞到非法位置
 *
 * 这些只有跑起来才知道。前几轮的教训就是这类交互 bug 只有真浏览器能发现。
 *
 * ## 怎么模拟粘贴
 *
 * 不用 CDP 的剪贴板权限（要额外授权、且 headless 下行为不稳），
 * 直接构造一个带 clipboardData 的 ClipboardEvent 派发给 .ProseMirror 节点：
 * 编辑器监听的正是这个事件，所以走的是**完全相同的代码路径**。
 *
 * 用法：npx tsx scripts/editor-markdown-ui-check.mts
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

/*
 * 必须先加载 .env 再 import prisma。
 *
 * `src/lib/prisma` 在**模块加载时**就读 `process.env.DATABASE_URL` 并拼路径，
 * 而 ESM 的 import 会被提升到文件顶部执行 —— 所以只能动态 import。
 * 静态 import 的写法会直接抛
 * `Cannot read properties of undefined (reading 'replace')`。
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })
const { prisma } = await import("../src/lib/prisma")

const PORT = 3107
const BASE = `http://127.0.0.1:${PORT}`
const DEVTOOLS_PORT = 9346
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"


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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function mergeCookie(res: Response, prev = ""): string {
  const jar = new Map<string, string>()
  for (const part of prev.split("; ")) {
    if (!part) continue
    const [k, ...v] = part.split("=")
    if (k) jar.set(k, v.join("="))
  }
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";")
    const [k, ...v] = pair.split("=")
    if (k) jar.set(k, v.join("="))
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
}

async function connect(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let nextId = 1
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error("WebSocket 连接失败"))
  })
  ws.onmessage = (msg) => {
    const d = JSON.parse(msg.data as string)
    if (d.id && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id)!
      pending.delete(d.id)
      d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result)
    }
  }
  return {
    send(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++
      return new Promise<never>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id)
            reject(new Error(`${method} 超时`))
          }
        }, 30000)
      })
    },
    close: () => ws.close(),
  }
}

async function waitForServer(): Promise<boolean> {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/api/auth/csrf`)
      if (res.ok) return true
    } catch {
      // 还没起来
    }
    await sleep(500)
  }
  return false
}

async function main() {
  if (!existsSync(EDGE)) throw new Error(`找不到 Edge：${EDGE}`)

  /*
   * ⚠️ 这个测试跑的是 `next start`，服务的是 .next 里的**构建产物**。
   * 改完源码必须先 `npm run build`，否则测的是旧代码 ——
   * 我为此白跑了一轮：新写的识别规则没生效，却以为是逻辑错了。
   */

  const server = spawn(
    "npx",
    ["--no-install", "next", "start", "-p", String(PORT)],
    { stdio: "ignore", shell: true }
  )

  const browser = spawn(
    EDGE,
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${DEVTOOLS_PORT}`,
      "--user-data-dir=" + process.env.TEMP + "\\edge-md-editor-profile",
      "about:blank",
    ],
    { stdio: "ignore" }
  )

  try {
    if (!(await waitForServer())) throw new Error("应用没起来")

    console.log("\n【0】准备站长登录态")
    /*
     * 自己建一个 OWNER 测试账号，而不是依赖「站长账号的密码是什么」。
     *
     * 理由：站长账号的真实密码不该出现在测试脚本里，也不该被测试改动；
     * 而它的临时密码可能在某次调试中已经变了，依赖它就是给自己制造不稳定。
     * 测试账号用完即删（finally 里清），db-state --clean 也会兜底。
     */
    const email = `mdeditor-${Date.now()}@test.local`
    const pwd = "MdEditor!2026"

    await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.240.0.1" },
      body: JSON.stringify({ name: "md-editor", email, password: pwd }),
    })
    // 跳过邮箱验证：直接把账号标成已验证，并提成 OWNER（才能进 /admin）
    await prisma.user.update({
      where: { email },
      data: { role: "OWNER", emailVerifiedAt: new Date() },
    })
    await prisma.emailCode.deleteMany({ where: { email } })

    const created = await prisma.user.findUnique({
      where: { email },
      select: { role: true, emailVerifiedAt: true },
    })
    check(
      "测试账号已建好且是 OWNER + 已验证",
      created?.role === "OWNER" && created.emailVerifiedAt !== null,
      `${created?.role}`
    )

    let cookie = ""
    {
      const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
      cookie = mergeCookie(csrfRes)
      const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({
          csrfToken,
          email,
          password: pwd,
          callbackUrl: `${BASE}/`,
        }),
      })
      cookie = mergeCookie(res, cookie)
      check("拿到会话 cookie", /session-token/.test(cookie))
    }

    // ---- 等 DevTools ----
    let wsVersion: { Browser: string } | null = null
    for (let i = 0; i < 40; i++) {
      try {
        wsVersion = (await (
          await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)
        ).json()) as { Browser: string }
        break
      } catch {
        await sleep(250)
      }
    }
    if (!wsVersion) throw new Error("Edge DevTools 没起来")
    console.log(`  浏览器：${wsVersion.Browser}`)

    const target = (await (
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, {
        method: "PUT",
      })
    ).json()) as { webSocketDebuggerUrl: string }
    const cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")

    for (const c of cookie.split("; ")) {
      const [name, ...rest] = c.split("=")
      if (!name) continue
      await cdp.send("Network.setCookie", {
        name,
        value: rest.join("="),
        domain: "127.0.0.1",
        path: "/",
      })
    }

    const run = async (expression: string) => {
      const r = (await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })) as { result?: { value?: unknown }; exceptionDetails?: unknown }
      if (r.exceptionDetails) {
        throw new Error(`页面脚本报错：${JSON.stringify(r.exceptionDetails).slice(0, 300)}`)
      }
      return r.result?.value
    }

    console.log("\n【1】打开后台新建文章页")
    await cdp.send("Page.navigate", { url: `${BASE}/admin/articles/new` })
    await sleep(4000)

    const ready = JSON.parse(
      (await run(
        `JSON.stringify({
           hasEditor: !!document.querySelector('.ProseMirror'),
           url: location.pathname,
           body: document.body.innerText.slice(0, 120),
         })`
      )) as string
    ) as { hasEditor: boolean; url: string; body: string }
    check("进入后台编辑页", ready.url === "/admin/articles/new", ready.url)
    check("编辑器已挂载（.ProseMirror 存在）", ready.hasEditor, ready.body.replace(/\n/g, " ").slice(0, 80))
    if (!ready.hasEditor) throw new Error("编辑器没渲染出来，后续无法验证")

    /**
     * 把 markdown 作为「粘贴」送进编辑器。
     *
     * 走真实的事件路径：编辑器在 .ProseMirror 上监听 paste，
     * 我们构造的 ClipboardEvent 带 clipboardData，逻辑与用户 Ctrl+V 完全一致。
     *
     * 只负责粘贴，不负责清空 —— 清空交给 `fresh()` 重载页面。
     */
    const paste = async (markdown: string) =>
      run(
        `(() => {
           const editor = document.querySelector('.ProseMirror');
           if (!editor) return "找不到编辑器";
           editor.focus();
           const dt = new DataTransfer();
           dt.setData('text/plain', ${JSON.stringify(markdown)});
           const event = new ClipboardEvent('paste', {
             clipboardData: dt,
             bubbles: true,
             cancelable: true,
           });
           editor.dispatchEvent(event);
           return 'ok';
         })()`
      )

    /**
     * 重新加载编辑页，拿到一个**干净**的编辑器。
     *
     * 为什么不「全选 + 删除」来清空：
     * ProseMirror 会**异步**从 DOM 同步选区，而「设选区 → 删除 → 粘贴」
     * 在同一个 tick 里执行时，PM 用的还是它自己的旧选区 ——
     * 实测结果是旧内容没删掉、新内容插到别处，断言全部对不上
     * （我为此白查了两轮：以为是转换逻辑坏了，其实是清空没生效）。
     * 重载页面虽然慢一点（约 2.5 秒），但状态完全确定。
     */
    const fresh = async () => {
      await cdp.send("Page.navigate", { url: `${BASE}/admin/articles/new` })
      await sleep(2500)
      const ok = await run(`!!document.querySelector('.ProseMirror')`)
      if (!ok) throw new Error("重载后编辑器未就绪")
    }

    console.log("\n【2】★★ 标题、粗体、列表、代码块都被转成真正的节点")
    {
      await paste(
        "## 二级标题\n\n这里有**粗体**和`行内代码`。\n\n- 第一点\n- 第二点\n\n```js\nconst a = 1\n```"
      )
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `(() => {
             const root = document.querySelector('.ProseMirror');
             return JSON.stringify({
               h2: document.querySelectorAll('.ProseMirror h2').length,
               h1: document.querySelectorAll('.ProseMirror h1').length,
               strong: document.querySelectorAll('.ProseMirror strong').length,
               code: document.querySelectorAll('.ProseMirror p code').length,
               li: document.querySelectorAll('.ProseMirror ul li').length,
               pre: document.querySelectorAll('.ProseMirror pre').length,
               h2Text: document.querySelector('.ProseMirror h2')?.textContent ?? '',
               // 原文里的 markdown 符号不该以纯文本形式残留
               rawHasHash: (root?.innerText ?? '').includes('##'),
               rawHasStars: (root?.innerText ?? '').includes('**'),
               rawHasBackticks: (root?.innerText ?? '').includes('\`\`\`'),
             });
           })()`
        )) as string
      ) as Record<string, unknown>

      check("★ 生成了 h2（不是纯文本 ##）", st.h2 === 1, `h2=${st.h2}`)
      check("★ 标题文字正确", st.h2Text === "二级标题", String(st.h2Text))
      check("★ 生成了 strong", (st.strong as number) >= 1, `strong=${st.strong}`)
      check("★ 行内代码变成了 code 元素", (st.code as number) >= 1, `code=${st.code}`)
      check("★ 生成了列表项", st.li === 2, `li=${st.li}`)
      check("★ 生成了代码块 pre", st.pre === 1, `pre=${st.pre}`)
      check("★★ 正文里没有残留 ## 符号", st.rawHasHash === false, String(st.rawHasHash))
      check("★★ 正文里没有残留 ** 符号", st.rawHasStars === false, String(st.rawHasStars))
      check("★★ 正文里没有残留 ``` 反引号", st.rawHasBackticks === false, String(st.rawHasBackticks))
    }

    console.log("\n【3】★★ 代码块的语言被正确识别（复用【2】的粘贴结果）")
    {
      const lang = (await run(
        `(() => {
           const select = document.querySelector('.ProseMirror .code-block-lang-select');
           return select ? select.value : '没有语言下拉';
         })()`
      )) as string
      check("★ markdown 的 ```js 被识别成语言 js", lang === "js", String(lang))
    }

    await fresh()
    console.log("\n【4】★★ 表格真的变成了 table 结构")
    {
      await paste("| 项目 | 说明 |\n| --- | --- |\n| A | 甲 |\n| B | 乙 |")
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `JSON.stringify({
             table: document.querySelectorAll('.ProseMirror table').length,
             th: document.querySelectorAll('.ProseMirror table th').length,
             td: document.querySelectorAll('.ProseMirror table td').length,
             thText: [...document.querySelectorAll('.ProseMirror table th')].map(e => e.textContent),
             tdText: [...document.querySelectorAll('.ProseMirror table td')].map(e => e.textContent),
             rawHasPipe: (document.querySelector('.ProseMirror')?.innerText ?? '').includes('| --- |'),
           })`
        )) as string
      ) as Record<string, unknown>

      check("★ 生成了 table", st.table === 1, `table=${st.table}`)
      check("★ 表头是 th（不是普通 td）", st.th === 2, `th=${st.th}`)
      check("★ 表体是 td", st.td === 4, `td=${st.td}`)
      check("★ 表头文字正确", JSON.stringify(st.thText) === '["项目","说明"]', JSON.stringify(st.thText))
      check("★ 表体文字正确", JSON.stringify(st.tdText) === '["A","甲","B","乙"]', JSON.stringify(st.tdText))
      check("★★ 正文里没有残留分隔行 | --- |", st.rawHasPipe === false, String(st.rawHasPipe))
    }

    await fresh()
    console.log("\n【5】★ 外链图片被换成说明文字（CSP 不允许的域名）")
    {
      await paste("![架构图](https://example.com/a.png)")
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `JSON.stringify({
             img: document.querySelectorAll('.ProseMirror img').length,
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
           })`
        )) as string
      ) as { img: number; text: string }

      check("★ 没有插入 img（否则发布后是空白）", st.img === 0, `img=${st.img}`)
      check("★ 换成了可读说明", st.text.includes("外链图片"), st.text.replace(/\n/g, " ").slice(0, 80))
      check("★ 说明里保留了原 URL", st.text.includes("example.com/a.png"))
    }

    await fresh()
    console.log("\n【6】★ 本站图片仍然正常插入（不该被误伤）")
    {
      await paste("![本站图](/api/images/not-exist.jpg)")
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `JSON.stringify({
             img: document.querySelectorAll('.ProseMirror img').length,
             src: document.querySelector('.ProseMirror img')?.getAttribute('src') ?? '',
           })`
        )) as string
      ) as { img: number; src: string }

      check("★ 本站相对路径的图片保留为 img", st.img === 1, `img=${st.img}`)
      check("src 正确", st.src === "/api/images/not-exist.jpg", st.src)
    }

    await fresh()
    console.log("\n【7】★★ 危险链接被移除、普通链接保留")
    {
      await paste("[危险](javascript:alert(1)) 和 [正常](https://example.com)")
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `JSON.stringify({
             hrefs: [...document.querySelectorAll('.ProseMirror a')].map(a => a.getAttribute('href')),
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
           })`
        )) as string
      ) as { hrefs: string[]; text: string }

      check(
        "★★ 没有 javascript: 链接",
        !st.hrefs.some((h) => (h ?? "").startsWith("javascript:")),
        JSON.stringify(st.hrefs)
      )
      check("正常链接保留", st.hrefs.some((h) => (h ?? "").includes("example.com")), JSON.stringify(st.hrefs))
      check("文字没丢", st.text.includes("危险"), st.text.replace(/\n/g, " ").slice(0, 60))
    }

    await fresh()
    console.log("\n【8】★ 普通文本粘贴不该被当成 markdown")
    {
      await paste("今天天气很好，我去公园散步，看到很多人在放风筝。")
      await sleep(600)

      const st = JSON.parse(
        (await run(
          `JSON.stringify({
             p: document.querySelectorAll('.ProseMirror p').length,
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
             hasHeading: document.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3').length,
           })`
        )) as string
      ) as { p: number; text: string; hasHeading: number }

      check("正文按普通段落插入", st.p >= 1 && st.text.includes("今天天气很好"), `p=${st.p}`)
      check("★ 没有被误转成标题", st.hasHeading === 0, `heading=${st.hasHeading}`)
    }

    console.log("\n【9】★★「整理 Markdown」按钮：就地转换已有内容")
    {
      const BTN = `document.querySelector('button[title*=\"Markdown\"]')`

      const title = (await run(`${BTN}?.getAttribute('title') ?? ''`)) as string
      check("★ 工具栏有该按钮", title.length > 0, title)
      check("按钮语义是「就地整理」而不是「打开弹层粘贴」", title.includes("就地"), title)

      /*
       * 构造「已经把 markdown 原文粘进来了、但没被自动转换」的状态。
       *
       * 手法：只提供 text/html、不给 text/plain。
       * 我们的 handlePaste 在拿不到纯文本时会直接放行（返回 false），
       * 于是 ProseMirror 按 HTML 解析，得到的就是「字面量 ## 的普通段落」——
       * 正是作者反馈的那份残留内容。
       *
       * ⚠️ 刻意**不用** `**粗体**` 作为输入：
       * TipTap 的 markdown 输入规则会把 `**x**` 自动变成粗体标记，
       * 于是文档里就有了行内格式 → 「已有格式」守卫判定冲突 → 不做整篇转换。
       * 那个守卫行为是**对的**（避免冲掉手工排的版），是这里的输入不够干净。
       * 「已有格式就不动」的端到端行为见【10】。
       */
      await fresh()
      await run(
        `(() => {
           const editor = document.querySelector('.ProseMirror');
           editor.focus();
           const dt = new DataTransfer();
           dt.setData('text/html', '<p>## 整理后的标题</p><p>这一行没有任何行内标记</p>');
           dt.setData('text/plain', '');
           editor.dispatchEvent(new ClipboardEvent('paste', {
             clipboardData: dt, bubbles: true, cancelable: true,
           }));
           return 'ok';
         })()`
      )
      await sleep(700)

      const before = JSON.parse(
        (await run(
          `JSON.stringify({
             h2: document.querySelectorAll('.ProseMirror h2').length,
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
           })`
        )) as string
      ) as { h2: number; text: string }
      check(
        "★ 点之前：确实是带 ## 的纯文本",
        before.h2 === 0 && before.text.includes("##"),
        before.text.replace(/\n/g, " ").slice(0, 70)
      )

      await run(`${BTN}?.click(); "clicked"`)
      await sleep(900)

      const after = JSON.parse(
        (await run(
          `JSON.stringify({
             h2: document.querySelectorAll('.ProseMirror h2').length,
             h2Text: document.querySelector('.ProseMirror h2')?.textContent ?? '',
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
             body: document.body.innerText,
           })`
        )) as string
      ) as { h2: number; h2Text: string; text: string; body: string }

      const hint = after.body.includes("未做改动") ? "（有不改动提示）" : ""
      check("★★ 点之后：就地生成了 h2", after.h2 === 1, `h2=${after.h2}${hint}`)
      check("★ 标题文字正确", after.h2Text === "整理后的标题", after.h2Text)
      check("★★ 正文里没有残留 ##", !after.text.includes("##"), after.text.replace(/\n/g, " ").slice(0, 70))
      check("★ 其余段落仍然保留", after.text.includes("这一行没有任何行内标记"), after.text.replace(/\n/g, " ").slice(0, 70))
    }

    console.log("\n【10】★★ 已有格式时不整篇重写（放着不管）")
    {
      // 先粘一段会被自动转换的 markdown，得到「已有格式」的正文
      await fresh()
      await paste("## 已有标题\n\n**粗体**正文")
      await sleep(800)

      const before = JSON.parse(
        (await run(
          `JSON.stringify({
             h2: document.querySelectorAll('.ProseMirror h2').length,
             strong: document.querySelectorAll('.ProseMirror strong').length,
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
           })`
        )) as string
      ) as { h2: number; strong: number; text: string }
      check("先造出已有格式的正文", before.h2 === 1 && before.strong === 1, `h2=${before.h2} strong=${before.strong}`)

      // 点「整理」：应当拒绝整篇重写，只给提示
      await run(`document.querySelector('button[title*="Markdown"]')?.click(); "ok"`)
      await sleep(900)

      const after = JSON.parse(
        (await run(
          `JSON.stringify({
             h2: document.querySelectorAll('.ProseMirror h2').length,
             strong: document.querySelectorAll('.ProseMirror strong').length,
             text: document.querySelector('.ProseMirror')?.innerText ?? '',
             body: document.body.innerText,
           })`
        )) as string
      ) as { h2: number; strong: number; text: string; body: string }

      check("★ 原有 h2 没有被冲掉", after.h2 === 1, `h2=${after.h2}`)
      check("★ 原有粗体没有被冲掉", after.strong === 1, `strong=${after.strong}`)
      check(
        "★★ 正文内容逐字未变",
        after.text === before.text,
        `${before.text.replace(/\n/g, " ")} → ${after.text.replace(/\n/g, " ")}`
      )
      check("★ 给出了「已有格式、未做改动」的提示", after.body.includes("未做改动"), "")
    }
    cdp.close()
  } finally {
    browser.kill()
    server.kill()
    // 清掉本次建的测试账号（含可能残留的验证码）
    await prisma.emailCode
      .deleteMany({ where: { email: { contains: "mdeditor-" } } })
      .catch(() => undefined)
    await prisma.user
      .deleteMany({ where: { email: { contains: "mdeditor-" } } })
      .catch(() => undefined)
    await prisma.$disconnect()
  }

  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error("\n测试出错：", e)
  process.exitCode = 1
})
