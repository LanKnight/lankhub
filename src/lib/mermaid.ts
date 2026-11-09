/**
 * Mermaid 图表的加载与渲染（**仅限客户端**）。
 *
 * 为什么单独抽一个文件：
 *  - `mermaid` 是重包（gzip 后几百 KB），必须动态 import，绝不能被 SSR 或首屏拉进来
 *  - 渲染有全局状态（`mermaid.render` 内部用全局配置与临时容器），并发渲染会串图，
 *    所以这里用一条 Promise 链把渲染**串行化**
 *  - 安全：`securityLevel: 'strict'` 只是第一层，输出还要过 DOMPurify
 *
 * ⚠️ 只允许从 `"use client"` 组件里 import 本模块。
 */

/** 单张图的源码上限：防止有人贴一整份大文件把浏览器卡死 */
const MAX_SOURCE_LENGTH = 20_000

let configured = false
let sequence = 0
let chain: Promise<unknown> = Promise.resolve()

/** 渲染结果缓存：同一张图在页面里出现多次时只渲染一次 */
const cache = new Map<string, string>()

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void
  parse: (text: string) => Promise<unknown>
  render: (id: string, text: string) => Promise<{ svg: string }>
}

/**
 * 定点清洗 mermaid 产出的 SVG。
 *
 * ## 为什么不用 DOMPurify
 *
 * 试过两种配法都失败：
 *  - `USE_PROFILES: { svg: true }` + 禁止 foreignObject → mermaid 的节点标签
 *    （`<foreignObject><div>`）整块被剥掉，图上只剩空方框
 *  - 加上 `html: true` 并放行 foreignObject → 连边标签也一起消失
 *    （DOMPurify 按 namespace 处理 foreignObject 里的 HTML 时会连内容一起丢）
 *
 * 于是改成**按 DOM 结构定点删**：用 DOMParser 解析成真正的 SVG 文档，
 * 只删「脚本元素」和「事件属性 / javascript: 链接」，其余原样保留。
 * 这样 mermaid 的输出结构完全不被破坏，而真正的执行面被去掉了。
 *
 * 另外 mermaid 本身在 `securityLevel: 'strict'` 下会转义标签文本，这是第一层。
 */
function sanitizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (doc.querySelector("parsererror")) {
    throw new Error("生成的 SVG 无法解析")
  }

  const walk = (element: Element) => {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase()
      // onload / onclick / onerror … 一律去掉
      if (name.startsWith("on")) {
        element.removeAttribute(attr.name)
        continue
      }
      // javascript: 伪协议（含 xlink:href）
      if ((name === "href" || name === "xlink:href" || name === "src") && /^\s*javascript:/i.test(attr.value)) {
        element.removeAttribute(attr.name)
      }
    }

    for (const child of [...element.children]) {
      const tag = child.tagName.toLowerCase()
      if (tag === "script" || tag === "iframe" || tag === "object" || tag === "embed") {
        child.remove()
        continue
      }
      walk(child)
    }
  }

  walk(doc.documentElement)
  return new XMLSerializer().serializeToString(doc.documentElement)
}

async function loadModules(): Promise<{ mermaid: MermaidModule }> {
  const mermaidModule = await import("mermaid")
  const mermaid = mermaidModule.default as unknown as MermaidModule

  if (!configured) {
    mermaid.initialize({
      startOnLoad: false,
      /*
       * strict：禁止图里的 HTML 标签与点击绑定（mermaid 自己会转义标签文本）。
       * 但前台 CSP 的 script-src 含 'unsafe-inline'，万一图里混进 <script>
       * 它**是会执行的**，所以输出还要过下面的 sanitizeSvg。
       */
      securityLevel: "strict",
      // neutral 是灰阶主题，和站点的水墨风最接近（default 是蓝色系）
      theme: "neutral",
      logLevel: "fatal",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      /*
       * 标签用 mermaid 默认的 HTML 标签（foreignObject + <div>）。
       * 实测把它设成 false 时 mermaid 12 会产出 `<g class="label"><rect></rect></g>`
       * 这种空壳，文字整块丢失 —— 所以保持默认，由 sanitizeSvg 决定保留什么。
       */
      flowchart: { htmlLabels: true, useMaxWidth: true, curve: "basis" },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      mindmap: { useMaxWidth: true },
    })
    configured = true
  }

  return { mermaid }
}

async function renderOnce(source: string): Promise<string> {
  const text = source.trim()
  if (text.length === 0) throw new Error("图表源码为空")
  if (text.length > MAX_SOURCE_LENGTH) {
    throw new Error(`图表源码过长（上限 ${MAX_SOURCE_LENGTH} 字符）`)
  }

  const cached = cache.get(text)
  if (cached) return cached

  const { mermaid } = await loadModules()

  // 先 parse：语法错误在这里抛出，错误信息比 render 阶段的可读
  await mermaid.parse(text)

  sequence += 1
  const { svg } = await mermaid.render(`lankhub-mermaid-${sequence}`, text)
  const clean = sanitizeSvg(svg)

  cache.set(text, clean)
  return clean
}

/**
 * 渲染一张 mermaid 图，返回**已清洗**的 SVG 字符串。
 *
 * 串行执行：`mermaid.render` 依赖全局配置与临时容器，并发调用会互相串。
 * 前一次失败不影响后一次（`then(run, run)`）。
 */
export function renderMermaid(source: string): Promise<string> {
  const run = () => renderOnce(source)
  const next = chain.then(run, run)
  chain = next.catch(() => undefined)
  return next
}

/** 语言标识是否表示 mermaid（兼容历史写法） */
export function isMermaidLanguage(language: string): boolean {
  const value = language.trim().toLowerCase()
  return value === "mermaid" || value === "mmd"
}
