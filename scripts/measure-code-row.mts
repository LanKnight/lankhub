/*
 * 量「验证码」标签与「获取验证码」按钮的实际像素位置，找出歪在哪。
 *
 * 为什么要专门量：这是视觉问题，凭感觉调会出现「改完还是歪、或者歪到另一边」。
 * 先把每个元素的 rect（含中心线）打出来，差在哪、差几像素一目了然。
 *
 * 用法：npx tsx scripts/measure-code-row.mts
 * 它自己启动应用与浏览器，跑完自动关闭。
 */
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DEVTOOLS_PORT = 9233
const APP_PORT = 3104
const MOCK_PORT = 45892
const BASE = `http://127.0.0.1:${APP_PORT}`

mkdirSync(".ui-shots", { recursive: true })

let forceRateLimited = false

const mock = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    /*
     * 让 mock 直接回 429，用来稳定地造出「发码按钮报错」这个状态。
     *
     * 为什么不靠真实冷却：真实冷却按**邮箱**计，而应用进程跨轮次不重启，
     * 于是上一轮留下的冷却会挡住这一轮 —— 第二步进不去，
     * 测量就变成「没找到发码按钮」（实测踩到两次）。
     * 用 mock 造错既稳定又不依赖任何账号状态。
     */
    if (forceRateLimited) {
      res.writeHead(429, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ message: "请求过于频繁，请稍后再试" }))
      return
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
      RESEND_API_KEY: "re_mock_for_measure_only_000",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  }
)

for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/api/auth/email-health`)).ok) break
  } catch {}
  await sleep(500)
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\edge-measure-profile",
    "about:blank",
  ],
  { stdio: "ignore" }
)

let wsVersion = null
for (let i = 0; i < 40; i++) {
  try {
    wsVersion = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).json()
    break
  } catch {
    await sleep(250)
  }
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
        }, 15000)
      })
    },
    close: () => ws.close(),
  }
}

/**
 * 测量表达式：找出「验证码」label 与同行按钮，输出各自的 rect。
 *
 * 关键指标是**文字基线与盒子中心**：
 * 一个 label 是纯文字、按钮是带 padding 的盒子，两者 outerHTML 的中心
 * 天然不同 —— 视觉上的「歪」通常来自「按钮框的中心」与「label 文字的中心」
 * 不在一条线上，或者按钮比 label 高出一截导致顶部不齐。
 */
const MEASURE = `(() => {
  const out = [];
  const labels = [...document.querySelectorAll('label')].filter(
    (l) => l.textContent.trim() === '验证码' || l.textContent.trim() === '邮箱验证码'
  );
  for (const label of labels) {
    const row = label.closest('div');
    if (!row) continue;
    const btn = row.querySelector('button');
    const lr = label.getBoundingClientRect();
    const br = btn ? btn.getBoundingClientRect() : null;

    // 用 Range 量「文字本身」的盒子，而不是 label 元素的盒子
    const range = document.createRange();
    range.selectNodeContents(label);
    const tr = range.getBoundingClientRect();

    /*
     * ★ 关键：还能量按钮**内部**的图标与文字。
     * 视觉上的「歪」如果不在 label 与按钮的相对位置上，
     * 就在按钮内部（图标+文字这一组相对于按钮框是否居中）。
     */
    let inner = null;
    if (btn) {
      const svg = btn.querySelector('svg');
      const sr = svg ? svg.getBoundingClientRect() : null;
      const textWrap = btn.querySelector('span') ?? btn;
      const wr = textWrap.getBoundingClientRect();

      /*
       * ★★ 最关键的一层：量**文字节点本身**的 rect。
       * 上面量 span 得到的是「行盒」，而行盒高度 = line-height，
       * 字形（尤其中文思源宋体）在行盒里并不是垂直居中的 ——
       * 所以「行盒中心」与「字形中心」可能差 1~2px，那正是肉眼看到的歪。
       */
      let glyph = null;
      const textNode = [...textWrap.childNodes].find(
        (n) => n.nodeType === 3 && n.textContent.trim()
      );
      if (textNode) {
        const gr = document.createRange();
        gr.selectNodeContents(textNode);
        const g = gr.getBoundingClientRect();
        glyph = { top: +g.top.toFixed(1), bottom: +g.bottom.toFixed(1), h: +g.height.toFixed(1) };
      }

      const groupTop = sr ? Math.min(sr.top, wr.top) : wr.top;
      const groupBottom = sr ? Math.max(sr.bottom, wr.bottom) : wr.bottom;
      inner = {
        hasIcon: !!svg,
        icon: sr ? { top: +sr.top.toFixed(1), bottom: +sr.bottom.toFixed(1), h: +sr.height.toFixed(1) } : null,
        textWrap: { top: +wr.top.toFixed(1), bottom: +wr.bottom.toFixed(1), h: +wr.height.toFixed(1) },
        glyph,
        groupTop: +groupTop.toFixed(1),
        groupBottom: +groupBottom.toFixed(1),
        groupVsButton: +(((groupTop + groupBottom) / 2) - ((br.top + br.bottom) / 2)).toFixed(1),
        iconVsText: sr
          ? +(((sr.top + sr.bottom) / 2) - ((wr.top + wr.bottom) / 2)).toFixed(1)
          : null,
        // ★★ 字形中心 vs 图标中心：这才是肉眼判断「图标与文字齐不齐」的依据
        iconVsGlyph:
          sr && glyph ? +(((sr.top + sr.bottom) / 2) - ((glyph.top + glyph.bottom) / 2)).toFixed(1) : null,
        // ★★ 字形中心 vs 按钮框中心：文字整体在按钮里是否居中
        glyphVsButton:
          glyph ? +(((glyph.top + glyph.bottom) / 2) - ((br.top + br.bottom) / 2)).toFixed(1) : null,
        // 按钮与同排输入框的高度差（视觉上「一高一低」常来自这里）
        paddingTop: getComputedStyle(btn).paddingTop,
        paddingBottom: getComputedStyle(btn).paddingBottom,
        lineHeight: getComputedStyle(btn).lineHeight,
        fontSize: getComputedStyle(btn).fontSize,
        display: getComputedStyle(btn).display,
        alignItems: getComputedStyle(btn).alignItems,
        borderWidth: getComputedStyle(btn).borderTopWidth,
      };
    }

    out.push({
      label: label.textContent.trim(),
      labelEl: { top: +lr.top.toFixed(1), bottom: +lr.bottom.toFixed(1), h: +lr.height.toFixed(1) },
      labelText: { top: +tr.top.toFixed(1), bottom: +tr.bottom.toFixed(1), h: +tr.height.toFixed(1) },
      button: br
        ? {
            top: +br.top.toFixed(1),
            bottom: +br.bottom.toFixed(1),
            h: +br.height.toFixed(1),
            centerY: +((br.top + br.bottom) / 2).toFixed(1),
          }
        : null,
      deltaCenterY: br ? +(((tr.top + tr.bottom) / 2) - ((br.top + br.bottom) / 2)).toFixed(1) : null,
      deltaTop: br ? +(tr.top - br.top).toFixed(1) : null,
      deltaBottom: br ? +(tr.bottom - br.bottom).toFixed(1) : null,
      rowClass: row.className,
      containerAlign: row ? getComputedStyle(row).alignItems : null,
      inner,
    });
  }
  return JSON.stringify(out, null, 2);
})()`

try {
  if (!wsVersion) throw new Error("Edge DevTools 没起来")
  console.log(`浏览器：${(wsVersion as { Browser: string }).Browser}\n`)

  // 需要先登录才能看 settings 页；这里量的是登录/注册/忘记密码三页
  const PAGES = ["/auth/login", "/auth/register", "/auth/forgot-password"]

/** 在页面里跑一段 JS */
async function run(cdp: Awaited<ReturnType<typeof connect>>, expression: string) {
  const r = (await cdp.send("Runtime.evaluate", { expression, returnByValue: true })) as {
    result: { value: unknown }
    exceptionDetails?: { exception?: { description?: string } }
  }
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "evaluate 异常")
  }
  return r.result.value
}

/** 填一个输入框（触发 React 的 onChange） */
function typeInto(selector: string, text: string) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return "找不到 " + ${JSON.stringify(selector)};
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  })()`
}

/** 进到注册页第二步（会真的建一个未验证账号，跑完清掉） */
async function gotoRegisterStep2(
  cdp: Awaited<ReturnType<typeof connect>>,
  testEmail: string
): Promise<string[]> {
  const logs: string[] = []
  await run(cdp, typeInto("#name", `测量${Date.now() % 100000}`))
  await run(cdp, typeInto("#email", testEmail))
  await run(cdp, typeInto("#password", "test123456"))
  await run(cdp, typeInto("#confirmPassword", "test123456"))
  await run(cdp, `document.querySelector('button[type="submit"]').click()`)
  await sleep(2500)
  const h1 = await run(cdp, `document.querySelector("h1")?.textContent ?? ""`)
  logs.push(`  进入第二步：h1="${h1}"`)
  return logs
}

/** 进到忘记密码页第二步（需要邮箱已验证的账号） */
async function gotoForgotStep2(cdp: Awaited<ReturnType<typeof connect>>, email: string) {
  await run(cdp, typeInto("#email", email))
  await run(cdp, `document.querySelector('button[type="submit"]').click()`)
  await sleep(2000)
  const h1 = await run(cdp, `document.querySelector("h1")?.textContent ?? ""`)
  return `  进入第二步：h1="${h1}"`
}

const registerEmail = `measure-${Date.now()}@test.local`


  for (const p of PAGES) {
    const t = await (
      await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, { method: "PUT" })
    ).json()
    const cdp = await connect(t.webSocketDebuggerUrl)

    await cdp.send("Runtime.enable")
    await cdp.send("Page.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 900,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await cdp.send("Page.navigate", { url: `${BASE}${p}` })
    await sleep(3000)

    // 对登录页要切到「验证码登录」标签才能看到发码按钮
    if (p === "/auth/login") {
      await run(
        cdp,
        `[...document.querySelectorAll('button')].find(b => b.textContent.includes('验证码登录'))?.click()`
      )
      await sleep(600)
    }
    // 注册页要走到第二步才有发码按钮
    if (p === "/auth/register") {
      const logs = await gotoRegisterStep2(cdp, registerEmail)
      logs.forEach((l) => console.log(l))
    }
    // 忘记密码页同理（用站长账号，它已标记为已验证）
    if (p === "/auth/forgot-password") {
      console.log(await gotoForgotStep2(cdp, "admin@lankhub.com"))
    }

    /*
     * ★ 关键一步：先在**报错状态**下量一次。
     * 假设是「错误提示把按钮顶偏」，所以必须把那个状态造出来再量，
     * 否则静态测量永远看不出问题（实测静态测量确实是全对齐的）。
     */
    if (p === "/auth/forgot-password") {
      /*
       * 造报错状态：先让 mock 回 429，再点一次按钮 → 出现错误提示。
       * 用 mock 而不是真实冷却，是为了跨轮次稳定（真实冷却会残留，见上）。
       */
      forceRateLimited = true

      const before = (await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const btn = [...document.querySelectorAll('button')].find(b => /重新发送|获取验证码/.test(b.textContent));
          if (!btn) return JSON.stringify({ error: "没找到发码按钮" });
          window.__sendBtn = btn;
          window.__sendWrap = btn.parentElement;
          const r = window.__sendWrap.getBoundingClientRect();
          return JSON.stringify({ h: +r.height.toFixed(1), top: +r.top.toFixed(1) });
        })()`,
        returnByValue: true,
      })) as { result: { value: string } }
      console.log(`  报错前 wrapper：${before.result.value}`)

      // 点一次就会命中 mock 的 429 → 出现错误提示
      await run(cdp, `window.__sendBtn?.click()`)
      await sleep(2600)

      const after = (await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          if (!window.__sendWrap) return JSON.stringify({ error: "wrapper 引用丢了" });
          const r = window.__sendWrap.getBoundingClientRect();
          const b = window.__sendBtn.getBoundingClientRect();
          const err = [...document.querySelectorAll('p')].find(p => /频繁|稍后|失败/.test(p.textContent));
          return JSON.stringify({
            wrapperH: +r.height.toFixed(1),
            wrapperTop: +r.top.toFixed(1),
            buttonTop: +b.top.toFixed(1),
            buttonH: +b.height.toFixed(1),
            // 按钮在 wrapper 内的相对位置：报错后 wrapper 变高、按钮上移，这里能看出
            buttonOffsetInWrapper: +(b.top - r.top).toFixed(1),
            hasError: !!err,
            errorText: err ? err.textContent.trim() : null,
          });
        })()`,
        returnByValue: true,
      })) as { result: { value: string } }
      console.log(`  报错后：${after.result.value}`)

      /*
       * ★ 关键断言：**报错状态下** label 与按钮是否仍然对齐。
       *
       * 这才是修复的验收点。修之前这里会量到约 -10px（按钮被顶上去），
       * 而静态（无报错）状态是 0px —— 所以只量静态永远发现不了问题。
       */
      const alignOnError = (await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const label = [...document.querySelectorAll('label')].find(l => /验证码/.test(l.textContent));
          const btn = window.__sendBtn;
          if (!label || !btn) return JSON.stringify({ error: "找不到 label 或按钮" });
          const lg = document.createRange();
          lg.selectNodeContents(label);
          const lr = lg.getBoundingClientRect();
          const br = btn.getBoundingClientRect();
          const lc = (lr.top + lr.bottom) / 2;
          const bc = (br.top + br.bottom) / 2;
          return JSON.stringify({
            labelCenter: +lc.toFixed(1),
            buttonCenter: +bc.toFixed(1),
            delta: +(lc - bc).toFixed(1),
          });
        })()`,
        returnByValue: true,
      })) as { result: { value: string } }
      const al = JSON.parse(alignOnError.result.value) as {
        delta?: number
        error?: string
      }
      if (al.error) {
        console.log(`  ✗ 报错状态下无法测量：${al.error}\n`)
      } else {
        const d = al.delta ?? 0
        console.log(
          `  ★★ 报错状态下 label 中心 − 按钮中心 = ${d}px  ` +
            `(${Math.abs(d) <= 1 ? "✓ 仍对齐" : "✗ 仍然歪！"})\n`
        )
      }

      // 量完把 mock 恢复正常，避免影响后续
      forceRateLimited = false
    }

    const r = (await cdp.send("Runtime.evaluate", {
      expression: MEASURE,
      returnByValue: true,
    })) as { result: { value: string } }

    console.log(`【${p}】`)
    const rows = JSON.parse(r.result.value) as Array<{
      label: string
      containerAlign: string
      labelText: { top: number; bottom: number; h: number }
      button: { top: number; bottom: number; h: number; centerY: number } | null
      deltaCenterY: number | null
      deltaTop: number | null
      deltaBottom: number | null
      rowClass: string
      inner: {
        display: string
        alignItems: string
        borderWidth: string
        paddingTop: string
        paddingBottom: string
        lineHeight: string
        fontSize: string
        hasIcon: boolean
        icon: { top: number; bottom: number; h: number } | null
        textWrap: { top: number; bottom: number; h: number }
        glyph: { top: number; bottom: number; h: number } | null
        groupVsButton: number
        iconVsText: number | null
        iconVsGlyph: number | null
        glyphVsButton: number | null
      } | null
    }>
    if (rows.length === 0) {
      console.log("  （没找到带发码按钮的「验证码」行）")
    }
    for (const row of rows) {
      console.log(`  label="${row.label}"  行容器 align-items=${row.containerAlign}`)
      console.log(`    label 文字：top=${row.labelText.top} bottom=${row.labelText.bottom} 高=${row.labelText.h}`)
      if (row.button) {
        console.log(`    按钮：     top=${row.button.top} bottom=${row.button.bottom} 高=${row.button.h} 中心=${row.button.centerY}`)
        console.log(
          `    ★ 文字中心 − 按钮中心 = ${row.deltaCenterY}px` +
            `   |  顶部差 ${row.deltaTop}px  底部差 ${row.deltaBottom}px`
        )
        const abs = Math.abs(row.deltaCenterY ?? 0)
        console.log(`    → ${abs <= 1 ? "已对齐" : abs <= 3 ? "轻微偏移" : "明显不齐"}`)

        // 按钮内部
        const inner = row.inner
        if (inner) {
          console.log(`    按钮内部：display=${inner.display} align-items=${inner.alignItems} border=${inner.borderWidth}`)
          console.log(
            `      padding ${inner.paddingTop} / ${inner.paddingBottom}` +
              ` · line-height ${inner.lineHeight} · font-size ${inner.fontSize}`
          )
          console.log(
            `      有图标=${inner.hasIcon}` +
              (inner.icon ? `  图标 top=${inner.icon.top} 高=${inner.icon.h} 中心=${((inner.icon.top + inner.icon.bottom) / 2).toFixed(1)}` : "")
          )
          console.log(
            `      行盒 top=${inner.textWrap.top} 高=${inner.textWrap.h} 中心=${((inner.textWrap.top + inner.textWrap.bottom) / 2).toFixed(1)}`
          )
          if (inner.glyph) {
            console.log(
              `      ★★ 字形 top=${inner.glyph.top} bottom=${inner.glyph.bottom} 高=${inner.glyph.h}` +
                ` 中心=${((inner.glyph.top + inner.glyph.bottom) / 2).toFixed(1)}`
            )
          }
          console.log(`      内容组中心 − 按钮框中心 = ${inner.groupVsButton}px`)
          if (inner.iconVsText !== null) console.log(`      图标中心 − 行盒中心 = ${inner.iconVsText}px`)
          if (inner.iconVsGlyph !== null) {
            console.log(`      ★★ 图标中心 − 字形中心 = ${inner.iconVsGlyph}px  ← 肉眼看的就是这个`)
          }
          if (inner.glyphVsButton !== null) {
            console.log(`      ★★ 字形中心 − 按钮框中心 = ${inner.glyphVsButton}px`)
          }
        }
      } else {
        console.log("    按钮：没找到")
      }
      console.log(`    行容器 class: ${row.rowClass}`)
      console.log("")
    }

    const shot = await cdp.send("Page.captureScreenshot", { format: "png" })
    writeFileSync(
      `.ui-shots/measure-${p.replace(/^\//, "").replace(/\//g, "-")}.png`,
      Buffer.from((shot as { data: string }).data, "base64")
    )

    cdp.close()
    await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/close/${t.id}`).catch(() => {})
  }
} catch (e) {
  console.error("测量出错：", (e as Error).message)
} finally {
  /*
   * ⚠️ 必须清理：为了进注册页第二步，本脚本每轮都会真的建一个未验证账号，
   * 并留下两条验证码记录。而**全站日限是按全表统计的** ——
   * 攒够几次就会把 verify-code-test 的全站日限测试挤爆（实测踩到：
   * 9 个残留账号 + 7 条验证码记录让那条断言误报失败）。
   */
  try {
    /*
     * ⚠️ 必须先加载 .env：src/lib/prisma 需要 DATABASE_URL。
     * 这是纯浏览器测量脚本，本来没引 dotenv —— 于是清理**静默失败**
     * （被下面的 catch 吞掉），账号一轮轮攒下来（实测留了 9 个）。
     */
    const { config: dotenvConfig } = await import("dotenv")
    const nodePath = await import("node:path")
    const { fileURLToPath } = await import("node:url")
    const root = nodePath.resolve(
      nodePath.dirname(fileURLToPath(import.meta.url)),
      ".."
    )
    dotenvConfig({ path: nodePath.join(root, ".env.local"), override: false })
    dotenvConfig({ path: nodePath.join(root, ".env"), override: false })

    const { prisma } = await import("../src/lib/prisma")
    const users = await prisma.user.deleteMany({ where: { email: { startsWith: "measure-" } } })
    const codes = await prisma.emailCode.deleteMany({ where: { email: { startsWith: "measure-" } } })
    console.log(`\n已清理测试数据：账号 ${users.count} 个 · 验证码 ${codes.count} 条`)
    await prisma.$disconnect()
  } catch (err) {
    // 清理失败要**显式报出来**，不能只留一句含糊的日志 ——
    // 否则残留会一直攒到挤爆别的测试（这正是之前发生的事）
    console.error("⚠️ 清理测试数据失败，请手动跑 npm run db:state -- --clean：", (err as Error).message)
  }

  edge.kill()
  app.kill()
  mock.close()
}
