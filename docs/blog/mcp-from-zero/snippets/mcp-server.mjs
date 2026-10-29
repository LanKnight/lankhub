#!/usr/bin/env node
/*
 * 一个"能跑、能看、能改"的 MCP 服务器骨架（零依赖）
 * ---------------------------------------------------------------
 * 这是文章里那份 lankhub-ops 的精简教学版：
 *   - 协议部分（stdio + 换行分隔的 JSON-RPC 2.0）与真实版本完全一致
 *   - 工具部分换成两个通用动作 status / deploy，方便你换成自己的业务
 *   - 去掉了所有与某台服务器绑定的东西，直接用环境变量传参
 *
 * 跑法：
 *   node mcp-server.mjs                  # 直接跑，会等 stdin 的 JSON 帧
 *   node mcp-server.mjs --selftest       # 自检：握手 + 列工具 + 两道闸门
 *
 * 接到 Agent 平台（Claude Desktop / DSH / 其它 MCP 宿主）：
 *   把 registration.yml 里的配置抄进宿主的 MCP 配置即可。
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const SERVER_NAME = "demo-ops"
const SERVER_VERSION = "1.0.0"
const LOG_DIR = path.join(import.meta.dirname, "logs")
const MAX_OUTPUT = 12000 // 工具输出上限：不截断就会把模型上下文灌满

/* ------------------------------------------------------------------ *
 * 配置：全部走环境变量，代码里不出现任何服务器信息
 * ------------------------------------------------------------------ */

const CONFIG = {
  host: process.env.DEMO_HOST || "",
  port: Number(process.env.DEMO_PORT || 22),
  user: process.env.DEMO_USER || "",
  keyPath: process.env.DEMO_KEY || "",
  sshBinary: process.env.DEMO_SSH || "ssh",
}

/* ------------------------------------------------------------------ *
 * 审计：每次工具调用落一行 JSONL（"谁在什么时候调了什么"）
 * ------------------------------------------------------------------ */

function audit(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(
      path.join(LOG_DIR, "audit.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
      "utf8"
    )
  } catch {
    /* 审计失败不影响主流程 */
  }
}

/* ------------------------------------------------------------------ *
 * 执行"远端动作"
 *
 * 关键设计：这里传出去的**只有动作名**（如 "status"），不接受任意命令。
 * 真正的白名单在服务器侧（见 run.sh），即使本进程被攻破也越不过那一层。
 * ------------------------------------------------------------------ */

function runRemote(action, timeoutMs = 20000) {
  if (!CONFIG.host || !CONFIG.user || !CONFIG.keyPath) {
    return Promise.resolve({
      ok: false,
      output:
        "缺少配置：请设置 DEMO_HOST / DEMO_USER / DEMO_KEY 三个环境变量。\n" +
        "（本骨架刻意不带默认值，避免把服务器信息写进代码。）",
    })
  }

  const args = [
    "-i", CONFIG.keyPath,
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=8",
    "-p", String(CONFIG.port),
    `${CONFIG.user}@${CONFIG.host}`,
    action,
  ]

  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""
    let done = false
    const child = spawn(CONFIG.sshBinary, args, { windowsHide: true })

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish({ ok: false, output: `超时（${timeoutMs}ms）` })
    }, timeoutMs)

    child.stdout.on("data", (c) => {
      if (stdout.length < MAX_OUTPUT * 4) stdout += c.toString("utf8")
    })
    child.stderr.on("data", (c) => {
      if (stderr.length < MAX_OUTPUT) stderr += c.toString("utf8")
    })
    child.on("error", (err) => finish({ ok: false, output: `无法启动 ssh：${err.message}` }))
    child.on("close", (code) => {
      const text = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim()
      finish({
        ok: code === 0,
        code,
        output: text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + "\n…（已截断）" : text,
      })
    })
  })
}

/* ------------------------------------------------------------------ *
 * 两个工具：一个只读、一个必须二次确认
 * ------------------------------------------------------------------ */

async function toolStatus() {
  const r = await runRemote("status")
  audit({ tool: "status", ok: r.ok, code: r.code })
  // 注意：工具执行"失败"要返回 isError 的文本，而不是 throw ——
  // throw 会让宿主看到一条 internal error，模型拿不到可读原因。
  if (!r.ok) return { text: `读取状态失败：\n\n${r.output}`, isError: true }
  return { text: r.output }
}

async function toolDeploy(args) {
  // 闸门 1：显式确认
  if (!args || args.confirm !== true) {
    return {
      text:
        "拒绝：deploy 必须显式 confirm: true。\n" +
        "建议顺序：先 status 看清当前版本 → 再 deploy({ confirm: true, expect: \"<提交号>\" })。",
      isError: true,
    }
  }
  // 闸门 2：目标版本必须是十六进制提交号（服务器侧还会再校验一次）
  const expect = String(args.expect || "").trim()
  if (!/^[0-9a-f]{7,40}$/.test(expect)) {
    return { text: "拒绝：expect 必须是 7–40 位十六进制提交号。", isError: true }
  }

  const r = await runRemote(`deploy ${expect}`, 60000)
  audit({ tool: "deploy", expect, ok: r.ok, code: r.code })
  if (!r.ok) return { text: `部署未启动：\n\n${r.output}`, isError: true }
  return { text: `已触发部署 ${expect}\n\n${r.output}` }
}

/* ------------------------------------------------------------------ *
 * 工具清单：schema 是模型唯一的"说明书"
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: "status",
    description: "读取服务器只读状态（版本 / 进程 / 磁盘）。不会改动任何东西。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "deploy",
    description:
      "在服务器上部署。会重启线上服务。必须 confirm: true，并给出目标提交号 expect；服务器侧会校验该提交是否真的存在。",
    inputSchema: {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "必须为 true" },
        expect: { type: "string", description: "目标提交号（7–40 位十六进制）" },
      },
      required: ["confirm", "expect"],
      additionalProperties: false,
    },
  },
]

const HANDLERS = {
  status: () => toolStatus(),
  deploy: (args) => toolDeploy(args),
}

/* ------------------------------------------------------------------ *
 * MCP 协议层：stdio + 换行分隔的 JSON-RPC 2.0
 *
 * 三个容易写错的地方：
 *   1. stdio 传输是**一行一个 JSON**，不是 LSP 那种 Content-Length 头
 *   2. initialize 的 protocolVersion 要回客户端要的版本（不支持就回自己最新的）
 *   3. 通知（没有 id）不要回包
 * ------------------------------------------------------------------ */

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n")
const reply = (id, result) => send({ jsonrpc: "2.0", id, result })
const replyError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } })

async function handle({ id, method, params }) {
  const isNotification = id === undefined || id === null

  switch (method) {
    case "initialize": {
      const asked = params && params.protocolVersion
      reply(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "demo-ops：只读 status 随时可用；deploy 需要 confirm 与目标提交号。",
      })
      return
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return // 通知不回
    case "ping":
      if (!isNotification) reply(id, {})
      return
    case "tools/list":
      reply(id, { tools: TOOLS })
      return
    case "tools/call": {
      const name = params && params.name
      const handler = HANDLERS[name]
      if (!handler) {
        replyError(id, -32602, `未知工具：${name}`)
        return
      }
      try {
        const result = await handler((params && params.arguments) || {})
        reply(id, {
          content: [{ type: "text", text: result.text }],
          isError: Boolean(result.isError),
        })
      } catch (err) {
        audit({ tool: name, ok: false, error: String(err && err.message) })
        reply(id, {
          content: [{ type: "text", text: `工具内部异常：${err.message}` }],
          isError: true,
        })
      }
      return
    }
    case "resources/list":
      reply(id, { resources: [] })
      return
    case "prompts/list":
      reply(id, { prompts: [] })
      return
    default:
      if (!isNotification) replyError(id, -32601, `不支持的方法：${method}`)
  }
}

/* ------------------------------------------------------------------ *
 * 自检：不需要服务器也能验证协议与闸门
 * ------------------------------------------------------------------ */

async function selftest() {
  let pass = 0
  const fail = []
  const check = (name, ok, detail = "") => {
    ok ? pass++ : fail.push(`${name}${detail ? " — " + detail : ""}`)
    console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`)
  }

  const call = async (msg) => {
    // 直接把消息喂进同一个 handle()，不经过子进程
    const out = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk) => {
      out.push(String(chunk))
      return true
    }
    await handle(msg)
    process.stdout.write = originalWrite
    return JSON.parse(out.join("").trim().split("\n")[0])
  }

  const init = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } },
  })
  check("initialize 回协议版本", Boolean(init.result && init.result.protocolVersion))

  const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  check("tools/list 两个工具", (list.result?.tools ?? []).length === 2)

  const noConfirm = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "deploy", arguments: { expect: "abc1234" } },
  })
  check("deploy 缺 confirm 被拒", Boolean(noConfirm.result?.isError))

  const badExpect = await call({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "deploy", arguments: { confirm: true, expect: "HEAD" } },
  })
  check("deploy 版本号非法被拒", Boolean(badExpect.result?.isError))

  console.log(`\n结果：${fail.length === 0 ? "全部通过" : fail.length + " 项失败"}`)
  process.exit(fail.length === 0 ? 0 : 1)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

if (process.argv.includes("--selftest")) {
  selftest()
} else {
  let buffer = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim()
      buffer = buffer.slice(i + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON 解析失败" } })
        continue
      }
      handle(msg).catch((err) => {
        if (msg && msg.id !== undefined) replyError(msg.id, -32603, `内部错误：${err.message}`)
      })
    }
  })
  process.stdin.on("end", () => process.exit(0))
}
