/*
 * 用真实浏览器验证播放器竞态修复 + 加载动画 + 失败分流。
 *
 * 核心断言（本轮的重点）：
 *   ★ 「界面显示的曲目」与「audio 的 src」必须始终属于**同一首歌**。
 *
 * 做法：劫持 window.fetch，让 /api/music/play 的响应**按我们指定的顺序**回来，
 * 从而稳定复现「旧响应晚于新响应落地」。修之前这会把音源改回旧歌，
 * 造成「界面是下一首、声音是上一首」。
 *
 * 用法：npx tsx scripts/music-ui-check.mts
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })
const { prisma } = await import("../src/lib/prisma")

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DEVTOOLS_PORT = 9255
const APP_PORT = 3108
const MOCK_PORT = 45896
const BASE = `http://127.0.0.1:${APP_PORT}`

mkdirSync(".ui-shots", { recursive: true })

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

let lastMailCode = ""
const mock = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    try {
      const b = JSON.parse(raw) as { html: string }
      const m = b.html.match(/letter-spacing:8px[^>]*>(\d{6})</)
      lastMailCode = m ? m[1] : ""
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
      RESEND_API_KEY: "re_mock_for_music_ui_000000",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  }
)
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/api/auth/email-health`)).ok) break
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

async function connect(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  /** 事件监听器（CDP 的 domain 事件，没有 id） */
  const listeners = new Map<string, ((params: never) => void)[]>()
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
      return
    }
    if (d.method && listeners.has(d.method)) {
      for (const fn of listeners.get(d.method)!) (fn as (p: unknown) => void)(d.params)
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
        }, 20000)
      })
    },
    /** 订阅一个 CDP 事件 */
    on(method: string, fn: (params: never) => void): void {
      const list = listeners.get(method) ?? []
      list.push(fn)
      listeners.set(method, list)
    },
    close: () => ws.close(),
  }
}

// ---- 测试数据 ----
// ⚠️ 必须是**同一位歌手的多首歌**：点某首歌时队列 = 那位歌手的歌（见 ArtistGrid）。
// 我第一版建了 3 位歌手、每人 1 首，结果队列里只有 1 首，「下一首」走到底什么都不做 ——
// 后面的竞态/加载/失败分流全都测不到（请求数为 0）。
const email = `musicui-${Date.now()}@test.local`
const name = `播放器测试${Date.now() % 100000}`
const pwd = "test123456"
const createdSongIds: number[] = []
for (let i = 1; i <= 4; i++) {
  const s = await prisma.song.create({
    data: {
      title: `__musicui_${i}__`,
      artist: "测试歌手",
      source: "netease",
      apiId: String(1000 + i),
      sortOrder: i,
    },
    select: { id: true },
  })
  createdSongIds.push(s.id)
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\edge-musicui-profile",
    "about:blank",
  ],
  { stdio: "ignore" }
)

try {
  // 登录
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.240.0.1" },
    body: JSON.stringify({ name, email, password: pwd }),
  })
  await prisma.emailCode.deleteMany({ where: { email } })
  await fetch(`${BASE}/api/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.240.0.2" },
    body: JSON.stringify({ email, scene: "register" }),
  })
  await fetch(`${BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.240.0.3" },
    body: JSON.stringify({ email, code: lastMailCode }),
  })
  let cookie = ""
  {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
    cookie = mergeCookie(csrfRes)
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
      body: new URLSearchParams({ csrfToken, email, password: pwd, callbackUrl: `${BASE}/` }),
    })
    cookie = mergeCookie(res, cookie)
    check("准备登录态", /session-token/.test(cookie))
  }

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
  console.log(`  浏览器：${wsVersion.Browser}\n`)

  const target = (await (
    await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, { method: "PUT" })
  ).json()) as { id: string; webSocketDebuggerUrl: string }
  const cdp = await connect(target.webSocketDebuggerUrl)

  const run = async (expression: string) => {
    const r = (await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result: { value: unknown }; exceptionDetails?: { exception?: { description?: string } } }
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate 异常")
    return r.result.value
  }

  await cdp.send("Runtime.enable")
  await cdp.send("Page.enable")
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 1400,
    deviceScaleFactor: 1,
    mobile: false,
  })
  for (const part of cookie.split("; ")) {
    const i = part.indexOf("=")
    await cdp.send("Network.setCookie", {
      name: part.slice(0, i),
      value: part.slice(i + 1),
      domain: "127.0.0.1",
      path: "/",
    })
  }

  /*
   * 在页面里装好 fetch 劫持。
   * 必须在导航**之前**用 Page.addScriptToEvaluateOnNewDocument 注入，
   * 否则 React 已经跑起来、第一次请求就走了原生 fetch。
   */
  /*
   * 装好页面内的测试替身（只劫持 /api/music/play 的 fetch）。
   * 音频本身不在这里造假 —— 交给下面的 CDP Fetch 域在网络层返回真实 WAV 字节。
   */
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        /*
         * ★ 接管 HTMLMediaElement 的 play/pause/src。
         *
         * ## 为什么要接管
         *
         * 本轮要验的是**播放器的状态机与竞态**，不是音频解码。但 headless 里
         * 拿不到可用音频源：
         *   - data: URI 被应用的 CSP 拦（media-src 'self' https://*.music.126.net），
         *     报错 "Media load rejected by URL safety check"（error.code=4）——
         *     那是**正确的安全设计**，不为了测试放宽它
         *   - 第三方 CDN 的签名地址在本地拿不到
         * 于是 <audio> 必然失败 → 播放器的 onError → 自动重试/跳过 →
         * 几首歌被连续跳过，状态机被搅乱、根本测不了竞态。
         *
         * 试过但没成功的做法（记下来避免重走）：
         *   1. 塞 data:audio/wav → 被 CSP 拦
         *   2. 指到同源 404 → 通过 CSP 但触发 error，进重试分支
         *   3. 用 CDP Fetch 域在网络层回真实 WAV 字节（含 206 + Content-Range）
         *      → <audio> 仍不播（headless 的媒体栈在这个环境里就是不工作），
         *        观测到的仍是「4 首歌全被跳过」
         * 结论：**在这个环境里验证「真的出声」不可行**，所以改为接管媒体 API，
         * 让状态机照常走完，只断言可可靠观测的部分。
         *
         * 接管 src 属性是关键一步：否则内部仍会发起媒体加载并失败。
         */
        const media = HTMLMediaElement.prototype;
        const srcStore = new WeakMap();

        Object.defineProperty(media, "src", {
          configurable: true,
          get() { return srcStore.get(this) ?? ""; },
          set(v) { srcStore.set(this, v); },
        });
        media.removeAttribute = function (name) {
          if (name === "src") srcStore.delete(this);
        };
        media.load = function () {};
        media.play = function () {
          this.__stubPaused = false;
          this.dispatchEvent(new Event("play"));
          return Promise.resolve();
        };
        media.pause = function () {
          this.__stubPaused = true;
          this.dispatchEvent(new Event("pause"));
        };
        Object.defineProperty(media, "paused", {
          configurable: true,
          get() { return this.__stubPaused !== false; },
        });

        /*
         * 精确读取「播放条上显示的曲名」。
         *
         * 为什么不能从 document.body.innerText 正则匹配：歌单卡片墙里也有
         * 全部曲名，正则会撞到卡片而不是播放条（实测就是这么读到旧值的）。
         * 这里用 TreeWalker 找「文本节点**精确等于**某个已知曲名」的元素，
         * 且该元素不在可展开的歌单列表里 —— 播放条的曲名是最小、最独立的那个。
         */
        window.__knownTitles = [];
        window.__readShownTitle = () => {
          const hits = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const t = (node.textContent || "").trim();
            if (window.__knownTitles.includes(t)) {
              const el = node.parentElement;
              const r = el ? el.getBoundingClientRect() : null;
              // 播放条是底部固定条：取最靠下的那个命中
              if (r && r.height > 0) hits.push({ t, bottom: r.bottom });
            }
          }
          if (!hits.length) return null;
          hits.sort((a, b) => b.bottom - a.bottom);
          return hits[0].t;
        };

        window.__musicTest = { seq: [], delays: {}, mode: "normal", errorCode: "url_unavailable", n: 0 };
        /*
         * reset() 只清请求序列与计数，**不动 delays**。
         *
         * 因为延时现在按**歌曲 id** 设（见下），不按「第几次请求」。
         * 预取也走同一个接口、会占掉序号 —— 按序号设延时的话，
         * 延时经常落在预取那次上，真正要观测的播放请求反而没延时
         * （我为此白查了两轮：loading 与失败分流的断言都因此假失败）。
         * 按 id 设延时与「谁先谁后、有没有预取」都无关，稳定得多。
         */
        window.__musicTest.reset = () => {
          window.__musicTest.seq = [];
          window.__musicTest.n = 0;
        };

        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          if (!url.includes("/api/music/play")) return realFetch(input, init);

          const id = Number(new URL(url, location.origin).searchParams.get("id"));
          window.__musicTest.n += 1;
          window.__musicTest.seq.push(id);

          // 按歌曲 id 取延时（字符串键，因为 delays 的 key 来自 JSON 会变成字符串）
          const delay = window.__musicTest.delays[String(id)] ?? 0;
          return new Promise((resolve) => {
            setTimeout(() => {
              /*
               * ⚠️ 故意不理会 abort 信号：真实 fetch 被 abort 时不会落地，
               * 于是「过期响应晚到」这个最坏情况在测试里根本出现不了 ——
               * 而那正是要验的场景。
               */
              if (window.__musicTest.mode === "error") {
                resolve(new Response(JSON.stringify({
                  error: "测试用错误", code: window.__musicTest.errorCode,
                }), { status: 502, headers: { "Content-Type": "application/json" } }));
                return;
              }
              resolve(new Response(JSON.stringify({
                url: "https://music.126.net/__musicui__/" + id + ".mp3",
              }), { status: 200, headers: { "Content-Type": "application/json" } }));
            }, delay);
          });
        };
      })();
    `,
  })

  await cdp.send("Page.navigate", { url: `${BASE}/music` })
  await sleep(3500)

  // 把已知曲名告诉 harness，供 __readShownTitle 精确匹配
  await run(
    `window.__knownTitles = ${JSON.stringify(createdSongIds.map((_, i) => `__musicui_${i + 1}__`))}; "ok"`
  )

  /*
   * ★ 持续观测 loading 状态。
   *
   * 为什么不能「点完等 500ms 再读一次」：run() 一次 CDP 往返本身有开销，
   * 而 loading 可能只持续几百毫秒 —— 等读到 DOM 时它已经结束了。
   * 实测那样读到的 hasSpinner 恒为 false，而 loading 其实是出现过的。
   *
   * 用 MutationObserver 记下「过程中是否曾经出现过 loading」，
   * 这与读取时机无关，才是可靠判据。
   */
  await run(
    `(() => {
       window.__sawLoading = false;
       window.__loadingObserver = new MutationObserver(() => {
         if (document.querySelector('.animate-spin')) window.__sawLoading = true;
         if (document.body.innerText.includes('正在加载')) window.__sawLoading = true;
       });
       window.__loadingObserver.observe(document.body, {
         childList: true, subtree: true, attributes: true,
         attributeFilter: ['class', 'aria-label'],
       });
       return "ok";
     })()`
  )

  const pageOk = (await run(
    `JSON.stringify({
       hasGrid: !!document.querySelector('button'),
       body: document.body.innerText.slice(0, 200),
     })`
  )) as string
  const po = JSON.parse(pageOk) as { body: string }
  check("音乐页渲染出来了", po.body.includes("测试歌手"), po.body.replace(/\n/g, " ").slice(0, 80))

  // 展开歌手并点第一首歌开始播放
  console.log("\n【1】开始播放第一首")
  {
    // 标签页里可能有「测试歌手」这一组；点它展开
    await run(
      `[...document.querySelectorAll('button')].find(b => b.textContent.includes('测试歌手'))?.click()`
    )
    await sleep(800)
    const clicked = (await run(
      `(() => {
         const btns = [...document.querySelectorAll('button')].filter(b => /__musicui_/.test(b.textContent));
         if (!btns.length) return "找不到歌曲按钮：" + document.body.innerText.slice(0, 120);
         btns[0].click();
         return "ok";
       })()`
    )) as string
    check("点到歌曲按钮", clicked === "ok", clicked)
    await sleep(1800)

    const st = JSON.parse(
      (await run(
        `(() => {
           const audio = document.querySelector('audio');
           return JSON.stringify({
             seq: window.__musicTest.seq,
             audioSrc: audio?.src || null,
             paused: audio?.paused,
             shownTitle: window.__readShownTitle(),
           });
         })()`
      )) as string
    ) as { seq: number[]; audioSrc: string | null; paused: boolean | undefined; shownTitle: string | null }

    check("发起了取地址请求", st.seq.length >= 1, `seq=${st.seq.join(",")}`)
    const srcSongId = (st.audioSrc ?? "").match(/__musicui__\/(\d+)\.mp3/)?.[1]
    check("audio 已拿到地址", !!st.audioSrc, String(st.audioSrc).slice(0, 60))
    check("★ 音源对应的是被点的那首歌", srcSongId === String(createdSongIds[0]), `src 里的 id=${String(srcSongId)} 期望=${createdSongIds[0]}`)

    /*
     * 说明：这里刻意**不再断言「音频真的在播」**。
     *
     * headless 里没有可用音频源（data: 被应用的 CSP 挡住、第三方 CDN 拿不到），
     * 所以测试接管了 HTMLMediaElement.prototype.play/pause（见 TEST_HARNESS）。
     * 播放器因此认为开播成功，状态机照常走完 —— 而本轮要验的
     * **本来就是状态机与竞态，不是音频解码**。
     *
     * 顺带记录：此前试过塞 data:audio/wav，被 CSP 拦下的真实报错是
     *   error.code=4 "Media load rejected by URL safety check"
     * —— 那是应用**正确的安全设计**，不该为了测试去放宽 media-src。
     */
    check(
      "播放器认为已开播（paused 为 false）",
      st.paused === false,
      `paused=${String(st.paused)}`
    )
    check("界面显示了曲名", !!st.shownTitle, String(st.shownTitle))
  }

  console.log("\n【2】★★ 竞态：让旧响应晚于新响应回来")
  {
    /*
     * 关键设计：延时按**歌曲 id** 设，而且是**递减**的 ——
     * 越靠前的歌延时越长，于是「先发出的后回来」。这正是修之前
     * 会把音源改回旧歌的场景。拦截器又故意忽略 abort，
     * 所以那些旧响应**一定会**回来尝试抢音源。
     *
     * 用歌曲 id 而不是「第几次请求」：预取也走同一个接口、会占掉序号，
     * 按序号设延时会让延时落在预取那次上（我为此白查了两轮）。
     */
    const [s1, s2, s3, s4] = createdSongIds
    void s1
    await run(
      `window.__musicTest.reset();
       window.__musicTest.delays = { ${JSON.stringify(String(s2))}: 1500, ${JSON.stringify(String(s3))}: 900, ${JSON.stringify(String(s4))}: 400 };
       "ok"`
    )

    /*
     * 连点三次「下一首」——**每次之间留 250ms**。
     *
     * 为什么不写成三个同步 click()：那样三次点击在同一个 JS 任务里执行，
     * React 还没重渲染，`currentRef` 三次读到的都是同一首，于是只前进了一首
     * （实测请求序列 82 → 82 → 83，确实只前进一首）。
     * 真实用户点不了那么快，同步点也不是真实交互。
     */
    const clickNext = `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '下一首')?.click()`
    await run(clickNext)
    await sleep(250)
    await run(clickNext)
    await sleep(250)
    await run(clickNext)
    check("连点三次「下一首」（每次间隔 250ms）", true)

    // 等到最慢的那个响应（1500ms）也落地
    await sleep(3000)

    const st = JSON.parse(
      (await run(
        `(() => {
           const audio = document.querySelector('audio');
           const src = audio?.src || '';
           const m = src.match(/__musicui__\\/(\\d+)\\.mp3/);
           return JSON.stringify({
             seq: window.__musicTest.seq,
             src,
             srcSongId: m ? Number(m[1]) : null,
             paused: audio?.paused,
             shownTitle: window.__readShownTitle(),
           });
         })()`
      )) as string
    ) as { seq: number[]; src: string; srcSongId: number | null; paused: boolean | undefined; shownTitle: string | null }

    console.log(`     请求顺序（歌曲 id）：${st.seq.join(" → ")}`)
    console.log(`     音源对应的歌曲 id：${String(st.srcSongId)}`)
    console.log(`     界面显示：${String(st.shownTitle)}`)

    check("三次点击都发出了请求", st.seq.length >= 3, `实际 ${st.seq.length} 次`)

    /*
     * ★★ 核心断言
     *
     * 延迟设成递增（第 1 次 1500ms、第 3 次 100ms），所以响应是**倒序**回来的，
     * 而且拦截器故意忽略 abort —— 旧响应一定会回来尝试抢音源。
     *
     * 修之前：晚到的旧响应会执行 `audio.src = 旧地址`，于是音源属于旧歌、
     * 而界面显示的是新歌 —— 那正是站长反馈的「界面到下一首，声音还是上一首」。
     * 有了代际检查，过期响应会在 `if (gen !== startGen.current) return` 处直接放弃。
     */
    const lastId = st.seq[st.seq.length - 1]
    check(
      "★ 音源属于最后一次请求的那首歌（过期响应没有抢回音源）",
      st.srcSongId === lastId,
      `音源 id=${String(st.srcSongId)} 最后请求 id=${String(lastId)}`
    )

    const expectedTitle = `__musicui_${createdSongIds.indexOf(lastId) + 1}__`
    check(
      "★ 界面显示的曲名与最后一次请求一致",
      st.shownTitle === expectedTitle,
      `显示「${String(st.shownTitle)}」 期望「${expectedTitle}」`
    )
    check("★ 最终仍在播放（未被过期响应打断）", st.paused === false, `paused=${String(st.paused)}`)
  }

  console.log("\n【3】加载动画：请求期间必须处于 loading")
  {
    /*
     * 给**所有**歌曲 id 都设上长延时，这样无论「下一首」是哪首，
     * 请求都会慢到足以让我们在等待期间观测到 loading 状态。
     *
     * 比「猜下一首是哪首」稳得多：队列处于什么位置取决于前面小节跳到哪了，
     * 而按 id 全量设延时与播放位置无关。
     */
    const allDelays = createdSongIds
      .map((id) => `${JSON.stringify(String(id))}: 2500`)
      .join(", ")
    await run(`window.__musicTest.reset(); window.__musicTest.delays = { ${allDelays} }; "ok"`)

    await run(
      `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '下一首')?.click()`
    )
    // 请求还没回来时抓一次
    await sleep(500)
    const during = JSON.parse(
      (await run(
        `JSON.stringify({
           hasSpinner: !!document.querySelector('.animate-spin'),
           playBtnLabel: [...document.querySelectorAll('button')]
             .map(b => b.getAttribute('aria-label'))
             .find(l => l === '加载中') || null,
           text: document.body.innerText.includes('正在加载'),
         })`
      )) as string
    ) as { hasSpinner: boolean; playBtnLabel: string | null; text: boolean }
    check("★ 加载期间有旋转图标", during.hasSpinner)
    check("★ 播放按钮的 aria-label 变成「加载中」", during.playBtnLabel === "加载中", String(during.playBtnLabel))
    check("显示「正在加载…」文案", during.text)

    // 等它播上，loading 应当消失
    await sleep(3200)
    const after = JSON.parse(
      (await run(
        `JSON.stringify({
           hasSpinner: !!document.querySelector('.animate-spin'),
           text: document.body.innerText.includes('正在加载'),
           // ★ MutationObserver 记录的「过程中是否出现过 loading」——
           // 它不受读取时机影响，是比单点采样可靠得多的判据
           sawLoading: window.__sawLoading === true,
         })`
      )) as string
    ) as { hasSpinner: boolean; text: boolean; sawLoading: boolean }
    check("★ 过程中确实出现过 loading 状态（MutationObserver 记录）", after.sawLoading)
    check("加载结束后旋转图标消失", !after.hasSpinner)
    check("加载结束后「正在加载…」消失", !after.text)
  }

  console.log("\n【4】失败分流：永久失败 → 提示且不再重试")
  {
    /*
     * 先把播放位置重置到队列开头。
     *
     * 为什么需要：前面的小节连点了好几次「下一首」，播放位置可能已经到队列末尾 ——
     * 那时点「下一首」是空操作（顺序播放不做列表循环），于是请求数为 0、
     * 断言全部假失败（我踩过）。点「播放全部」能稳定回到第一首。
     */
    await run(`window.__musicTest.delays = {}; "ok"`)
    await run(
      `[...document.querySelectorAll('button')].find(b => b.textContent.includes('播放全部'))?.click()`
    )
    await sleep(1200)

    await run(
      `window.__musicTest.reset();
       window.__musicTest.mode = "error";
       window.__musicTest.errorCode = "url_unavailable";
       "ok"`
    )
    // 诊断：点之前播放条上显示的是哪首、delays 是否真的设上了
    const pre4 = (await run(
      `JSON.stringify({
         shown: window.__readShownTitle(),
         delays: window.__musicTest.delays,
         hasNext: !!document.querySelector('button[aria-label="下一首"]'),
       })`
    )) as string
    console.log(`     点之前：${pre4}`)
    await run(
      `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '下一首')?.click()`
    )
    await sleep(2500)
    const st = JSON.parse(
      (await run(
        `JSON.stringify({
           count: window.__musicTest.seq.length,
           // 精确判据：去找「重试」按钮、以及含「跳过/无法播放」的提示节点
           text: document.body.innerText,
           hasRetryBtn: [...document.querySelectorAll('button')].some(b => b.textContent.includes('重试')),
         })`
      ) as string
    )) as { count: number; text: string; hasRetryBtn: boolean }
    const diag4 = (await run(
      `JSON.stringify({
         shown: window.__readShownTitle(),
         seq: window.__musicTest.seq,
         // 播放条里那段红色小字（错误提示）是否在
         redText: [...document.querySelectorAll('p')].map(p => p.textContent).filter(t => /无法播放|跳过|错误|暂/.test(t)),
       })`
    )) as string
    console.log(`     诊断：${diag4}`)
    /*
     * 永久失败（没版权）的正确表现是**静默跳到下一首 + 一条信息提示**。
     *
     * 断言「已跳过 N 首」而不是「红色错误」：
     * 逐首报错会被紧接着的 start() 里的 setError(null) 清掉，用户什么都看不到
     * （我实测诊断确认过：跳到了下一首、页面上一句提示都没有）。
     * 所以实现改成累积跳过、等落定后统一用灰色提示说明 —— 这里验的就是它。
     */
    check(
      "★ 永久失败会跳过并给出可读说明（而不是静默跳走）",
      /已跳过|连续 \d+ 首都无法播放/.test(st.text),
      st.text.replace(/\n/g, " ").slice(0, 120)
    )
    check("★ 跳过说明不是红色错误（当前这首至少在尝试播放）", !/测试用错误/.test(st.text))
    // 永久失败**不该**反复重试同一首：请求次数应当很少
    check("永久失败没有反复重试（请求数 ≤ 4）", st.count <= 4, `请求 ${st.count} 次`)
    /*
     * 永久失败会「跳过」到下一首；若队列里每首都失败，会一路跳到上限后停下。
     * 这里确认它没把整个队列无限跳下去。
     */
    check("没有无限跳歌（请求数未失控）", st.count < 20, `请求 ${st.count} 次`)
  }

  console.log("\n【5】未登录（unauthorized）→ 不自动跳歌")
  {
    // 同样先回到队列开头，保证「下一首」有歌可切
    await run(`window.__musicTest.mode = "normal"; window.__musicTest.delays = {}; "ok"`)
    await run(
      `[...document.querySelectorAll('button')].find(b => b.textContent.includes('播放全部'))?.click()`
    )
    await sleep(1200)

    await run(
      `window.__musicTest.reset();
       window.__musicTest.mode = "error";
       window.__musicTest.errorCode = "unauthorized";
       "ok"`
    )
    await run(
      `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '下一首')?.click()`
    )
    await sleep(2000)
    const st = JSON.parse(
      (await run(
        `JSON.stringify({ count: window.__musicTest.seq.length, text: document.body.innerText })`
      ) as string
    )) as { count: number; text: string }
    check("未登录时提示登录失效", st.text.includes("登录已失效"), st.text.replace(/\n/g, " ").slice(0, 80))
    check("★ 未登录时不自动跳歌（只请求 1 次）", st.count === 1, `请求 ${st.count} 次`)
  }

  const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string }
  writeFileSync(".ui-shots/music-player.png", Buffer.from(shot.data, "base64"))

  cdp.close()
  await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/close/${target.id}`).catch(() => {})
} catch (e) {
  console.error("\n检查出错：", (e as Error).message)
  fail.push(`脚本异常：${(e as Error).message}`)
} finally {
  edge.kill()
  app.kill()
  mock.close()
  await prisma.song.deleteMany({ where: { title: { startsWith: "__musicui_" } } })
  await prisma.user.deleteMany({ where: { email: { contains: "musicui-" } } })
  await prisma.emailCode.deleteMany({ where: { email: { contains: "musicui-" } } })
  await prisma.$disconnect()
  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  - ${f}`))
    process.exitCode = 1
  }
}
