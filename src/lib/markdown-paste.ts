/**
 * Markdown 粘贴的识别与预处理。
 *
 * ## 要解决的问题
 *
 * 编辑器的粘贴走 ProseMirror 默认行为：纯文本只会变成段落，`##`、`**`、`-`
 * 全部当成普通字符。于是从大模型复制来的文章贴进来全是原始 markdown。
 *
 * 这里提供两件事：
 *  1. 判断一段纯文本「是不是 markdown」——避免把普通文章误当 markdown 转换
 *  2. 转换前的预处理——把 CSP 不允许的外链图片换成人能看懂的说明
 *
 * ## 为什么不自己写 markdown 解析
 *
 * 解析交给 `@tiptap/markdown`（基于 marked），它直接产出 ProseMirror JSON，
 * 表格、嵌套列表、行内代码、标题层级都能对上 schema。手写解析器在嵌套列表与
 * 转义字符上极容易出错，而且会随着标准演进不断出问题。
 *
 * ## 为什么解析后还要再过一遍 sanitize
 *
 * `@tiptap` 的 markdown 解析路径**不校验链接协议**（源码里直接 `href: token.href`
 * 赋值），与它的 HTML 解析路径不同。所以 `[点我](javascript:...)` 会被原样
 * 变成 link 节点。前台渲染器虽然有 `isSafeUrl` 兜底，但脏数据不该写进库。
 */

import { isSafeUrl } from "./utils"

/**
 * CSP 里 `img-src` 允许的图片域名后缀。
 *
 * 与 next.config.ts 的 `https://*.music.126.net` 保持一致。
 * ⚠️ 通配符要求有子域名，所以裸域 `music.126.net` **不算** —— 这里保持一致，
 * 否则会出现「编辑器里看着正常、发布后被 CSP 挡掉」的怪事。
 */
const CSP_IMAGE_HOST_SUFFIX = ".music.126.net"

/**
 * 这个图片地址在当前 CSP 下**能否真的显示出来**。
 *
 * 与 `isSafeUrl` 的区别：那个只判断协议安不安全（http/https 都算安全），
 * 这个额外判断「域名在不在 CSP 白名单里」。两者都要过：
 *  - 不安全 → 绝不能写进库
 *  - 安全但域名不在白名单 → 写进去也是空白图，不如换成说明文字
 */
export function isAllowedImageSrc(src: string): boolean {
  const value = src.trim()
  if (value.length === 0) return false

  // 相对路径 = 本站资源（/api/images/xxx），CSP 的 'self' 覆盖它
  if (value.startsWith("/") && !value.startsWith("//")) return true

  /*
   * data: / blob: 虽然 CSP 允许，但图片扩展默认 `allowBase64: false`，
   * 解析时会把 `img[src^="data:"]` 直接过滤掉 —— 写进库也是空图。
   * 而且 base64 图片动辄几百 KB，塞进正文 JSON 只会把文章撑爆。
   */
  if (/^(data|blob):/i.test(value)) return false

  try {
    const url = new URL(value, "http://local")
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    return url.hostname.endsWith(CSP_IMAGE_HOST_SUFFIX)
  } catch {
    return false
  }
}

/**
 * 判定纯文本是否「看起来像 markdown」。
 *
 * 为什么要门槛而不是「有 md 语法就转」：
 * 普通文章里出现一个 `*` 或一行 `- ` 很常见，误转换会把正文结构搅乱。
 *
 * 信号分两档：
 *  - **强信号**（权重 2）：几乎不可能是普通散文里出现的东西 ——
 *    围栏代码块、表格行、ATX 标题、图片、链接、粗体
 *  - **弱信号**（权重 1）：可能是普通文本，比如以 `- ` 开头的一行、
 *    以 `1. ` 开头的一行、以 `> ` 开头的一行
 *
 * 累计权重达到 2 才算 markdown。这样：
 *  - 「只有一个表格」「只有一张图」「只有两条链接」都能识别（单个强信号就够）
 *  - 而「正文里恰好有一行 `- xxx`」不会误触发（弱信号单独不够）
 *
 * 误判的兜底：转换是**一个** ProseMirror 事务，`Ctrl+Z` 一次就能整体撤销回原文。
 */
const STRONG_SIGNALS: RegExp[] = [
  /^[ \t]*```/m, // 围栏代码块
  /^[ \t]*\|.*\|[ \t]*$/m, // 表格行
  /^#{1,6}[ \t]+\S/m, // ATX 标题
  /!\[[^\]\n]*\]\([^)\s]+\)/, // 图片
  /\[[^\]\n]+\]\([^)\s]+\)/, // 行内链接
  /\*\*[^*\n]+\*\*/, // 粗体
]

const WEAK_SIGNALS: RegExp[] = [
  /^[ \t]*[-*+][ \t]+\S/m, // 无序列表
  /^[ \t]*\d+\.[ \t]+\S/m, // 有序列表
  /^[ \t]*>[ \t]+\S/m, // 引用
]

const STRONG_WEIGHT = 2
const MIN_SCORE = 2
const MIN_LENGTH = 10

export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < MIN_LENGTH) return false

  /*
   * shebang 开头的一定是脚本，不是文章。
   * 不加这个判断的话，脚本里的 `# 注释` 会被当成一级标题。
   */
  if (/^#!/.test(trimmed)) return false

  let score = 0
  for (const pattern of STRONG_SIGNALS) {
    if (pattern.test(trimmed)) {
      score += STRONG_WEIGHT
      if (score >= MIN_SCORE) return true
    }
  }
  for (const pattern of WEAK_SIGNALS) {
    if (pattern.test(trimmed)) {
      score += 1
      if (score >= MIN_SCORE) return true
    }
  }
  return false
}

/** 被改写的图片 */
export interface RewrittenImage {
  /** markdown 里的 alt 文本 */
  alt: string
  /** 原地址。内嵌图片（base64）不记录，太长且没有价值 */
  url: string
  reason: "external" | "embedded" | "unsafe"
}

/**
 * 把「粘进来也不会显示」的图片换成说明文字。
 *
 * 只动 CSP 不允许的地址 —— 本站图片与网易云 CDN 的封面保持原样。
 *
 * 为什么换成「链接 + 说明」而不是直接丢弃：
 * 作者在后台得一眼看到「这里还需要手动上传」，才不会等到发布后
 * 发现文章中间空了一块却不知道少了什么。
 */
const MD_IMAGE = /!\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g

export function rewriteExternalImages(markdown: string): {
  markdown: string
  rewritten: RewrittenImage[]
} {
  const rewritten: RewrittenImage[] = []

  const out = markdown.replace(MD_IMAGE, (whole, alt: string, url: string) => {
    if (isAllowedImageSrc(url)) return whole

    const name = alt.trim()
    const label = name.length > 0 ? `「${name}」` : ""

    if (/^(data|blob):/i.test(url)) {
      rewritten.push({ alt: name, url: "", reason: "embedded" })
      return `🖼 内嵌图片${label}不支持，请手动上传`
    }

    /*
     * 协议不安全（javascript: 之类）时**不要**生成链接 ——
     * 那等于把危险地址从图片挪到链接上。
     */
    if (!isSafeUrl(url)) {
      rewritten.push({ alt: name, url: "", reason: "unsafe" })
      return `🖼 图片地址不安全，已移除${name.length > 0 ? `（原说明：${name}）` : ""}`
    }

    rewritten.push({ alt: name, url, reason: "external" })
    return `🖼 外链图片${label}：[${url}](${url})`
  })

  return { markdown: out, rewritten }
}

/** ProseMirror JSON 的最小结构（只声明本文件用到的字段） */
export interface MarkdownNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: MarkdownNode[]
  /*
   * `type` 必须是必填。
   *
   * TipTap 的 `JSONContent` 里 marks 的 `type` 就是必填的，写成可选会让
   * `editor.commands.setContent(...)` 报类型不兼容 —— 那种报错会指向调用处，
   * 看起来像是 setContent 用法错了，其实是这里的类型定义放宽过度。
   */
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export interface SanitizeResult {
  content: MarkdownNode[]
  /** 被移除的不安全链接数量 */
  droppedLinks: number
  /** 被移除的图片数量（协议不安全或域名不在 CSP 白名单） */
  droppedImages: number
}

/**
 * 允许出现在「纯文本文档」里的节点类型。
 *
 * 只有这几种说明正文**完全没有格式** —— 也就是「一段从聊天界面直接粘进来、
 * 还没被整理过的 markdown 原文」的形态。
 */
const PLAIN_NODE_TYPES = new Set(["doc", "paragraph", "text", "hardBreak"])

/**
 * 整篇是否只是「未经整理的纯文本」。
 *
 * ## 为什么要判断这个
 *
 * 「整理 Markdown」这个动作有两种做法：
 *  1. 只处理纯文本（保守）—— 不会碰到作者已经手工调过的排版
 *  2. 不管三七二十一整篇重写 —— 会把已有格式全部冲掉
 *
 * 第 2 种在作者花时间排过版之后就是**破坏性**的。所以只有确认「整篇都是
 * 纯文本、没有任何格式」时才允许整篇转换；只要出现标题、列表、图片、表格、
 * 代码块、粗体等任何已有格式，就判定为冲突并放着不动。
 */
export function isPlainTextDocument(nodes: MarkdownNode[]): boolean {
  for (const node of nodes) {
    if (!node.type || !PLAIN_NODE_TYPES.has(node.type)) return false
    // 带标记（粗体/斜体/链接…）的文字也算「已有格式」
    if (node.type === "text" && node.marks && node.marks.length > 0) return false
    if (node.content && !isPlainTextDocument(node.content)) return false
  }
  return true
}

/**
 * 清洗 markdown 解析出来的文档。
 *
 * 两道过滤，都是「宁可不显示也不要留脏数据」：
 *  - 链接：`javascript:` 等协议直接摘掉 link 标记（保留文字）
 *  - 图片：协议不安全、或域名不在 CSP 白名单 → 整个节点丢掉
 */
export function sanitizeMarkdownDoc(doc: MarkdownNode): SanitizeResult {
  let droppedLinks = 0
  let droppedImages = 0

  function walk(nodes: MarkdownNode[]): MarkdownNode[] {
    const out: MarkdownNode[] = []

    for (const node of nodes) {
      if (node.type === "image") {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : ""
        if (!isSafeUrl(src) || !isAllowedImageSrc(src)) {
          droppedImages += 1
          continue
        }
        out.push(node)
        continue
      }

      const next: MarkdownNode = { ...node }
      if (node.content) next.content = walk(node.content)
      if (node.marks) {
        // 标记全被摘掉时保留空数组没有意义，直接删掉这个字段
        const kept = node.marks.filter((mark) => {
          if (mark.type !== "link") return true
          const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : ""
          if (isSafeUrl(href)) return true
          droppedLinks += 1
          return false
        })
        if (kept.length > 0) next.marks = kept
        else delete next.marks
      }
      out.push(next)
    }

    return out
  }

  return { content: walk(doc.content ?? []), droppedLinks, droppedImages }
}
