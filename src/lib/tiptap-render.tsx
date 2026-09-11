import { Fragment, type ReactNode } from "react"

import CodeBlock from "@/components/blog/CodeBlock"

import { hastToReact } from "./hast-to-react"
import { lowlight } from "./highlight"
import { isSafeUrl } from "./utils"

/** TipTap 文档里实际会出现的节点 / 标记结构 */
interface TipTapMark {
  type?: string
  attrs?: Record<string, unknown>
}

interface TipTapNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

/**
 * 标记由内到外的包裹顺序。
 *
 * TipTap 按 marks 数组顺序渲染，而数组顺序取决于作者的操作先后；
 * 这里固定成一种顺序，保证同一段文本的 SSR 输出稳定可比。
 */
const MARK_ORDER = ["code", "bold", "italic", "strike", "underline", "link"]

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

/**
 * 解析文章正文。
 *
 * ⚠️ 非 JSON 内容**不回退**为 HTML 渲染 —— 这是既有的存储型 XSS 防护，
 * 不能为了「兼容」而放宽。
 */
export function parseTiptapContent(content: string): TipTapNode {
  try {
    const parsed: unknown = JSON.parse(content)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as TipTapNode
    }
  } catch {
    // 落到下面的空文档
  }
  return { type: "doc", content: [] }
}

/**
 * 把存储的 TipTap JSON 渲染成 React 元素。
 *
 * 在服务端完成渲染，正文直接进入首屏 HTML —— 这是本次改造的核心收益：
 * TipTap / ProseMirror / highlight.js 全部不再进入前台客户端包。
 */
export function renderTiptapDocument(content: string): ReactNode {
  return renderNode(parseTiptapContent(content), 0)
}

function renderChildren(node: TipTapNode): ReactNode[] {
  return (node.content ?? []).map((child, index) => renderNode(child, index))
}

function renderNode(node: TipTapNode, key: number): ReactNode {
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{renderChildren(node)}</Fragment>
    case "paragraph":
      return <p key={key}>{renderChildren(node)}</p>
    case "heading":
      return renderHeading(node, key)
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node)}</blockquote>
    case "bulletList":
      return <ul key={key}>{renderChildren(node)}</ul>
    case "orderedList":
      return (
        <ol key={key} start={readOrderedListStart(node) ?? undefined}>
          {renderChildren(node)}
        </ol>
      )
    case "listItem":
      return <li key={key}>{renderChildren(node)}</li>
    case "codeBlock":
      return renderCodeBlock(node, key)
    case "image":
      return renderImage(node, key)
    case "horizontalRule":
      return <hr key={key} />
    case "hardBreak":
      return <br key={key} />
    case "text":
      return renderText(node, key)
    default:
      return renderUnknown(node, key)
  }
}

function renderHeading(node: TipTapNode, key: number): ReactNode {
  const Tag = HEADING_TAGS[readHeadingLevel(node) - 1]
  return <Tag key={key}>{renderChildren(node)}</Tag>
}

/** 编辑器只开放 1-3 级，但历史数据可能有更高层级，夹取到 1-6 防止越界 */
function readHeadingLevel(node: TipTapNode): number {
  const raw = node.attrs?.level
  const level = typeof raw === "number" ? Math.trunc(raw) : 1
  return level >= 1 && level <= 6 ? level : 1
}

/** orderedList 的 start 属性；等于 1 时省略，避免输出多余的 HTML 属性 */
function readOrderedListStart(node: TipTapNode): number | null {
  const start = toFiniteNumber(node.attrs?.start)
  if (start === null || start === 1) return null
  return Math.trunc(start)
}

function renderText(node: TipTapNode, key: number): ReactNode {
  let element: ReactNode = node.text ?? ""

  const marks = [...(node.marks ?? [])].sort(
    (a, b) => markRank(a.type) - markRank(b.type)
  )
  for (const mark of marks) {
    element = wrapMark(mark, element, key)
  }
  return element
}

function markRank(type: string | undefined): number {
  const index = MARK_ORDER.indexOf(type ?? "")
  return index === -1 ? MARK_ORDER.length : index
}

function wrapMark(mark: TipTapMark, children: ReactNode, key: number): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{children}</strong>
    case "italic":
      return <em key={key}>{children}</em>
    case "strike":
      return <s key={key}>{children}</s>
    case "underline":
      return <u key={key}>{children}</u>
    case "code":
      return <code key={key}>{children}</code>
    case "link": {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : ""
      if (!isSafeUrl(href)) {
        // javascript: / data: 之类的协议只保留文本，不输出 <a>
        return children
      }
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
    default:
      return children
  }
}

function renderImage(node: TipTapNode, key: number): ReactNode {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : ""
  if (!isSafeUrl(src)) return null

  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : ""
  const title =
    typeof node.attrs?.title === "string" ? node.attrs.title : undefined

  return (
    // 正文图片是本站上传资源，由 /api/images/[filename] 流式返回。
    // 不用 next/image 是为了不改动现有图片接口与布局行为（与改造前 TipTap 的 <img> 一致）。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={key}
      src={src}
      alt={alt}
      title={title}
      width={readImageDimension(node.attrs?.width)}
      height={readImageDimension(node.attrs?.height)}
    />
  )
}

function readImageDimension(value: unknown): number | undefined {
  const size = toFiniteNumber(value)
  return size !== null && size > 0 ? Math.trunc(size) : undefined
}

function renderCodeBlock(node: TipTapNode, key: number): ReactNode {
  const code = collectText(node)
  const language =
    typeof node.attrs?.language === "string" ? node.attrs.language : ""

  return (
    <CodeBlock key={key} code={code} language={language}>
      {highlightCode(code, language)}
    </CodeBlock>
  )
}

/** 提取节点纯文本（代码块内容都是文本子节点） */
function collectText(node: TipTapNode): string {
  if (typeof node.text === "string") return node.text
  return (node.content ?? []).map(collectText).join("")
}

/**
 * 服务端语法高亮。
 *
 * `lowlight.highlight()` 遇到未注册语言会直接抛异常，所以必须先 `registered()` 守卫，
 * 否则作者写一个未知语言标签就能让整篇文章 500。
 * `registered()` 会解析别名，js→javascript、sh→bash、yml→yaml 都能正确命中。
 */
function highlightCode(code: string, language: string): ReactNode {
  if (!language || !lowlight.registered(language)) {
    return code
  }
  try {
    return hastToReact(lowlight.highlight(language, code), 0)
  } catch {
    // 语法定义存在但解析失败：降级成纯文本，不影响正文其余部分
    return code
  }
}

/** 未知节点：只渲染子节点，保证不崩溃、也不丢内容 */
function renderUnknown(node: TipTapNode, key: number): ReactNode {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[tiptap-render] 未处理的节点类型: ${String(node.type)}`)
  }
  return <Fragment key={key}>{renderChildren(node)}</Fragment>
}

function toFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
