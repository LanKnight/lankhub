#!/usr/bin/env node
/**
 * 把本地一篇 Markdown 文章发布到站点。
 *
 * 用法：
 *   node scripts/publish-article.mjs --dir "D:\...\炒外汇" --collection "梗典卷宗"
 *   node scripts/publish-article.mjs --dir ... --collection ... --dry-run
 *
 * 它会做四件事：
 *   1. 读目录里的 Markdown，取 H1 当标题、`> 摘要：…` 当摘要
 *   2. 把正文里的本地图片用 sharp 压缩（与站点同一套档位）后上传，替换成 /api/images/xxx.webp
 *   3. 把 cover.* 压成封面并上传
 *   4. 调用站点自己的「新建文章」接口（复用服务端的校验：slug 唯一、发布必须有合集）
 *
 * 刻意不做「已存在就覆盖」：同标题文章已存在时直接报错退出，
 * 改稿请在站内改（本地重发会把线上改动冲掉）。
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import ImageExtension from "@tiptap/extension-image"
import { TableKit } from "@tiptap/extension-table"
import { MarkdownManager } from "@tiptap/markdown"
import StarterKit from "@tiptap/starter-kit"
import { encode } from "next-auth/jwt"
import sharp from "sharp"

/** 与 src/lib/image-compress.ts 对齐：正文图 1600 / 封面 1880，WebP q0.82，目标 900KB */
const PRESETS = {
  inline: { maxEdge: 1600, quality: 0.82, targetBytes: 900 * 1024 },
  cover: { maxEdge: 1880, quality: 0.82, targetBytes: 900 * 1024 },
}

/** 反向代理请求体上限约 1MB，留余量 */
const UPLOAD_SAFE_LIMIT = 1020 * 1024

function log(...args) {
  console.error(...args)
}

function fail(code, message, extra = {}) {
  console.log(JSON.stringify({ ok: false, code, error: message, ...extra }))
  process.exit(code === "exists" ? 2 : code === "collection" ? 3 : 1)
}

/* ------------------------------ 参数 ------------------------------ */

const { values: argv } = parseArgs({
  options: {
    dir: { type: "string" },
    collection: { type: "string" },
    file: { type: "string" },
    title: { type: "string" },
    cover: { type: "string" },
    base: { type: "string", default: "https://www.lankhub.xyz" },
    draft: { type: "boolean", default: false },
    output: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    "ssh-host": { type: "string", default: "8.134.186.118" },
    "ssh-user": { type: "string", default: "root" },
    "ssh-key": { type: "string" },
    "remote-repo": { type: "string", default: "/root/lankhub" },
  },
})

if (!argv.dir) fail("args", "缺少 --dir（文章所在目录）")
if (!argv.collection) fail("args", "缺少 --collection（合集名称）")

const dir = path.resolve(argv.dir)
if (!existsSync(dir) || !statSync(dir).isDirectory()) fail("args", `目录不存在：${dir}`)

const base = argv.base.replace(/\/+$/, "")

/* --------------------------- 认证（站长会话） --------------------------- */

function readSecret() {
  if (process.env.LANKHUB_AUTH_SECRET) return process.env.LANKHUB_AUTH_SECRET.trim()
  if (!argv["ssh-key"]) {
    fail("auth", "没有 LANKHUB_AUTH_SECRET，也没给 --ssh-key，无法获取站点密钥")
  }
  const remote = `cd ${argv["remote-repo"]} && grep -h AUTH_SECRET .env.local | head -1 | cut -d= -f2-`
  const out = execFileSync(
    "ssh",
    [
      "-i",
      argv["ssh-key"],
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=15",
      `${argv["ssh-user"]}@${argv["ssh-host"]}`,
      remote,
    ],
    { encoding: "utf8" }
  )
  const secret = out.trim().replace(/^["']|["']$/g, "")
  if (secret.length < 8) fail("auth", "从服务器读到的 AUTH_SECRET 异常")
  return secret
}

const isHttps = base.startsWith("https://")
const cookieName = isHttps ? "__Secure-authjs.session-token" : "authjs.session-token"

let cachedSecret = null

async function ownerCookie() {
  // 延迟读取：--output（只转换不发布）时不需要密钥
  if (!cachedSecret) cachedSecret = readSecret()
  const token = await encode({
    token: { sub: "1", id: "1", role: "OWNER", permissions: null },
    secret: cachedSecret,
    salt: cookieName,
  })
  return `${cookieName}=${token}`
}

/* ------------------------------ Markdown ------------------------------ */

function pickMarkdownFile() {
  if (argv.file) {
    const explicit = path.resolve(dir, argv.file)
    if (!existsSync(explicit)) fail("args", `指定的文件不存在：${argv.file}`)
    return explicit
  }
  const mdFiles = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => path.join(dir, name))
  if (mdFiles.length === 0) fail("args", "目录里没有 .md 文件")

  // 优先取文件名带《》的（正文），再退回取正文最长的那个
  const bookTitled = mdFiles.filter((file) => /《.+》/.test(path.basename(file)))
  if (bookTitled.length === 1) return bookTitled[0]
  if (bookTitled.length > 1) {
    return bookTitled.sort((a, b) => statSync(b).size - statSync(a).size)[0]
  }
  return mdFiles.sort((a, b) => statSync(b).size - statSync(a).size)[0]
}

function parseArticle(file) {
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "")
  const lines = raw.split("\n")

  let title = null
  let summary = null
  const bodyLines = []

  for (const line of lines) {
    if (!title) {
      const heading = line.match(/^#\s+(.+?)\s*$/)
      if (heading) {
        title = heading[1].trim()
        continue
      }
    }
    if (!summary) {
      const lead = line.match(/^>\s*摘要\s*[:：]\s*(.+?)\s*$/)
      if (lead) {
        summary = lead[1].trim()
        continue
      }
    }
    bodyLines.push(line)
  }

  // 去掉正文开头的分隔线（标题与摘要被抽走后会留下一条 ---）
  let body = bodyLines.join("\n").replace(/^\s*\n+/, "")
  body = body.replace(/^(---|\*\*\*|___)\s*\n/, "").replace(/^\s*\n+/, "")

  return { title, summary, body, file }
}

const manager = new MarkdownManager({
  extensions: [StarterKit, ImageExtension, TableKit],
})

/* ------------------------------ 图片 ------------------------------ */

async function compressImage(file, preset) {
  const { maxEdge, quality, targetBytes } = preset

  const encode = async (tolerant) => {
    let edge = maxEdge
    let q = quality
    let last = null
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, info } = await sharp(file, tolerant ? { failOn: "none" } : undefined)
        .rotate()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        // sharp 的 quality 是 1–100 的整数（站点那边 canvas 用的是 0–1）
        .webp({ quality: Math.round(q * 100) })
        .toBuffer({ resolveWithObject: true })

      last = { data, width: info.width, height: info.height, quality: q, edge }
      if (data.length <= targetBytes) break

      q = Math.max(0.4, Number((q - 0.08).toFixed(2)))
      edge = Math.max(480, Math.round(edge * 0.9))
    }
    return last
  }

  try {
    return { ...(await encode(false)), warning: null }
  } catch (strictError) {
    /*
     * 有些本地图片是**截断的**（例如导出中断的 JPEG）：严格解码会报
     * "premature end of JPEG image"。这种文件通常还能解出绝大部分画面，
     * 用 failOn:"none" 容错重试，并把"可能不完整"作为警告回报，
     * 让作者自己决定要不要换图 —— 比直接失败发不出去更实用。
     */
    const fallback = await encode(true)
    return {
      ...fallback,
      warning: `文件可能不完整（${strictError.message}），已按容错方式解码`,
    }
  }
}

/*
 * 注意：上传接口会给文件**重新命名**（时间戳 + uuid），所以"按内容 hash 去重"做不到。
 * 这里只负责传一个安全的原名，站点返回什么 url 就用什么。
 */
function uploadName(file) {
  const base = path.parse(file).name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "image"
  return `${base}.webp`
}

async function uploadImage(buffer, name, cookie) {
  const form = new FormData()
  form.append("file", new File([buffer], name, { type: "image/webp" }))
  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: { cookie },
    body: form,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `上传失败（HTTP ${res.status}）`)
  }
  return data.url
}

/* ------------------------------ API ------------------------------ */

async function apiGet(pathname, cookie) {
  const res = await fetch(`${base}${pathname}`, { headers: { cookie } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${pathname} 失败（HTTP ${res.status}）${data?.error ? "：" + data.error : ""}`)
  return data
}

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
  const mdPath = pickMarkdownFile()
  const parsed = parseArticle(mdPath)
  const title = (argv.title || parsed.title || "").trim()
  if (!title) fail("parse", "没有找到标题（文件第一行应为 `# 标题`，或用 --title 指定）")
  if (!parsed.body.trim()) fail("parse", "正文为空")

  if (parsed.summary && parsed.summary.length > 500) {
    parsed.summary = parsed.summary.slice(0, 497) + "…"
    log("  摘要超过 500 字，已截断")
  }

  log(`  标题：${title}`)
  log(`  摘要：${parsed.summary ? parsed.summary.slice(0, 40) + "…" : "（无，将取正文开头）"}`)
  log(`  源文件：${path.basename(mdPath)}`)

  const doc = manager.parse(parsed.body)

  // 收集正文里的本地图片
  const localImages = []
  const walk = (node) => {
    if (node?.type === "image") {
      const src = node.attrs?.src ?? ""
      if (!/^https?:|^\/api\//.test(src)) localImages.push({ node, src })
    }
    for (const child of node?.content ?? []) walk(child)
  }
  walk(doc)

  const coverFile = argv.cover
    ? path.resolve(dir, argv.cover)
    : readdirSync(dir)
        .filter((name) => /^cover\.(png|jpe?g|webp)$/i.test(name))
        .map((name) => path.join(dir, name))[0]

  if (argv.output) {
    // 只做转换，不碰网络：输出 JSON 供人工检查
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          title,
          summary: parsed.summary,
          file: path.basename(mdPath),
          images: localImages.map((item) => item.src),
          cover: coverFile ? path.basename(coverFile) : null,
          contentBytes: Buffer.byteLength(JSON.stringify(doc)),
        },
        null,
        2
      )
    )
    return
  }

  const cookie = await ownerCookie()

  // 合集
  const collections = await apiGet("/api/admin/collections", cookie)
  const collection = (Array.isArray(collections) ? collections : []).find(
    (item) => item.name.trim() === argv.collection.trim()
  )
  if (!collection) {
    fail("collection", `找不到合集「${argv.collection}」`, {
      available: (Array.isArray(collections) ? collections : []).map((item) => item.name),
    })
  }

  // 同标题已存在？直接报错，不覆盖（列表接口 limit 上限 50，所以要翻页扫完）
  let page = 1
  let scanned = 0
  let total = Infinity
  let duplicate = null
  while (scanned < total && page <= 50 && !duplicate) {
    const list = await apiGet(`/api/admin/articles?limit=50&page=${page}`, cookie)
    const articles = list?.articles ?? []
    total = Number(list?.total ?? 0)
    scanned += articles.length
    duplicate = articles.find((item) => item.title.trim() === title) ?? null
    if (articles.length === 0) break
    page += 1
  }
  if (duplicate) {
    fail("exists", `线上已有同名文章「${title}」，未做任何修改`, {
      url: `${base}/blog/${duplicate.slug}`,
      hint: "改稿请在站内改；确实要重发请先删掉线上那篇",
    })
  }

  // 压缩并上传正文图片
  const uploadStats = []
  const warnings = []
  for (const [index, item] of localImages.entries()) {
    const localPath = path.resolve(dir, item.src)
    if (!localPath.startsWith(dir)) fail("image", `图片路径越界：${item.src}`)
    if (!existsSync(localPath)) fail("image", `正文引用的图片不存在：${item.src}`)

    const originalBytes = statSync(localPath).size
    const compressed = await compressImage(localPath, PRESETS.inline)
    if (compressed.warning) {
      warnings.push(`${item.src}：${compressed.warning}`)
      log(`  ⚠ ${item.src}：${compressed.warning}`)
    }
    if (compressed.data.length > UPLOAD_SAFE_LIMIT) {
      fail("image", `「${item.src}」压缩后仍有 ${(compressed.data.length / 1024 / 1024).toFixed(2)}MB，超过上传上限`)
    }
    const url = await uploadImage(compressed.data, uploadName(localPath), cookie)
    if (!url.startsWith("/api/images/")) throw new Error(`上传返回异常：${url}`)

    item.node.attrs.src = url
    uploadStats.push({
      source: item.src,
      url,
      originalBytes,
      bytes: compressed.data.length,
      width: compressed.width,
      height: compressed.height,
    })
    log(`  [${index + 1}/${localImages.length}] ${item.src} → ${(compressed.data.length / 1024).toFixed(0)}KB`)
  }

  // 封面
  let coverUrl = null
  if (coverFile && existsSync(coverFile)) {
    const compressed = await compressImage(coverFile, PRESETS.cover)
    if (compressed.data.length > UPLOAD_SAFE_LIMIT) {
      fail("image", `封面压缩后仍有 ${(compressed.data.length / 1024 / 1024).toFixed(2)}MB，超过上传上限`)
    }
    coverUrl = await uploadImage(compressed.data, uploadName(coverFile), cookie)
    log(`  封面 ${path.basename(coverFile)} → ${(compressed.data.length / 1024).toFixed(0)}KB`)
  } else {
    log("  没有找到封面（cover.png/jpg/webp），将不带封面")
  }

  // 摘要兜底：取正文首个非空段落前 120 字
  let summary = parsed.summary
  if (!summary) {
    const firstText = []
    const collectText = (node) => {
      if (node?.type === "text" && node.text) firstText.push(node.text)
      for (const child of node?.content ?? []) collectText(child)
    }
    collectText(doc)
    summary = firstText.join("").slice(0, 120) || null
  }
  if (summary && summary.length > 500) summary = summary.slice(0, 497) + "…"

  const payload = {
    title,
    summary,
    content: JSON.stringify(doc),
    coverImage: coverUrl,
    published: !argv.draft,
    pinned: false,
    collectionId: collection.id,
  }

  const res = await fetch(`${base}/api/admin/articles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify(payload),
  })
  const created = await res.json().catch(() => null)
  if (!res.ok) {
    fail("create", created?.error || `创建文章失败（HTTP ${res.status}）`)
  }

  const originalTotal = uploadStats.reduce((sum, item) => sum + item.originalBytes, 0)
  const finalTotal = uploadStats.reduce((sum, item) => sum + item.bytes, 0)

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: created.id,
        title: created.title,
        slug: created.slug,
        url: `${base}/blog/${created.slug}`,
        collection: collection.name,
        published: created.published,
        images: uploadStats.length,
        warnings,
        cover: coverUrl,
        bytes: { original: originalTotal, final: finalTotal },
        contentBytes: Buffer.byteLength(payload.content),
      },
      null,
      argv.json ? 0 : 2
    )
  )
}

main().catch((error) => {
  fail("crash", error?.message || String(error))
})
