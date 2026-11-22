/*
 * 用 stdio 直接跟运维侧车对话，验证并调用新工具 ops_publish_article。
 * 等价于 DSH 里的一次 MCP 工具调用（本会话的 MCP 进程是旧代码，还没加载新工具）。
 */
import { spawn } from "node:child_process"

const SERVER = "D:\\aboutWork\\lankhub-sidecars\\ops\\server.js"
const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"] })

let buffer = ""
const pending = new Map()
let seq = 1

child.stdout.setEncoding("utf8")
child.stdout.on("data", (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  }
})

function request(method, params) {
  const id = seq++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`超时：${method}`))
    }, 300000)
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      },
    })
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
  })
}

const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "publish-smoke", version: "1.0.0" },
  })
  console.log("  服务器：", init.serverInfo?.name, init.serverInfo?.version)
  notify("notifications/initialized", {})

  const tools = await request("tools/list", {})
  const names = (tools.tools ?? []).map((t) => t.name)
  console.log("  工具数：", names.length)
  console.log("  含 ops_publish_article：", names.includes("ops_publish_article"))

  const result = await request("tools/call", {
    name: "ops_publish_article",
    arguments: {
      dir: "D:\\aboutWork\\assignment\\blogPosts\\炒外汇",
      collection: "梗典卷宗",
    },
  })
  const text = (result.content ?? []).map((c) => c.text).join("\n")
  console.log("  isError：", Boolean(result.isError))
  console.log(text)
} finally {
  child.kill()
}
