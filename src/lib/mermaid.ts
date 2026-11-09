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
 * ## 为什么用 <template> + innerHTML，而不是 DOMParser("image/svg+xml")
 *
 * 第一版用的是严格 XML 解析。实测遇到带 `<br/>` 的标签就整段失败 ——
 * mermaid 会把空标签规范成 `<br>`（HTML 写法），XML 解析器遇到未闭合标签直接报
 * parsererror，于是图表报「生成的 SVG 无法解析」。
 *
 * `<template>` 走的是**容错的 HTML 解析器**：<br> 这类空标签、命名空间、
 * foreignObject 里的 div 都能正确落到 DOM 上，而且 SVG 元素在 HTML 解析器里
 * 会正确进入 SVG 命名空间，序列化回去浏览器照样认。
 *
 * ## 为什么不用 DOMPurify
 *
 * 试过两种配法都失败：
 *  - `USE_PROFILES: { svg: true }` + 禁止 foreignObject → mermaid 的节点标签
 *    （`<foreignObject><div>`）整块被剥掉，图上只剩空方框
 *  - 加上 `html: true` 并放行 foreignObject → 连边标签也一起消失
 *    （DOMPurify 按 namespace 处理 foreignObject 里的 HTML 时会连内容一起丢）
 *
 * 于是改成**按 DOM 结构定点删**：只删「脚本类元素」和「事件属性 / javascript: 链接」，
 * 其余原样保留。这样 mermaid 的输出结构完全不被破坏，而真正的执行面被去掉了。
 * 另外 mermaid 本身在 `securityLevel: 'strict'` 下会转义标签文本，这是第一层。
 */
function sanitizeSvg(svg: string): string {
  const template = document.createElement("template")
  template.innerHTML = svg

  const root = template.content.firstElementChild
  if (!root || root.tagName.toLowerCase() !== "svg") {
    throw new Error("生成的 SVG 结构异常")
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

  walk(root)
  return template.innerHTML
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
      /*
       * 用 base 主题 + 自定义配色，而不是内置的 neutral/default：
       *  - neutral 只有黑白灰（站长反馈"单调"）
       *  - default 是 lavender 紫，一眼是"第三方默认主题"，和站点水墨风不搭
       * 这里取「青黛」：淡青蓝节点 + 蓝灰连线，纸色背景不变。
       * 单张图仍可在源码首行用 `%%{init: {...}}%%` 覆盖（mermaid 原生能力）。
       */
      theme: "base",
      themeVariables: {
        background: "#fdfcf9",
        primaryColor: "#e9f0f5",
        primaryBorderColor: "#8aa8bd",
        primaryTextColor: "#1f2f3a",
        secondaryColor: "#dde9f1",
        secondaryBorderColor: "#7d9cb2",
        tertiaryColor: "#f4f8fb",
        tertiaryBorderColor: "#c2d3df",
        lineColor: "#5f88a3",
        textColor: "#2b3a45",
        mainBkg: "#e9f0f5",
        nodeBorder: "#8aa8bd",
        clusterBkg: "#f1f6fa",
        clusterBorder: "#cbdae5",
        edgeLabelBackground: "#fdfcf9",
        fontSize: "15px",
        // 时序图
        actorBkg: "#e9f0f5",
        actorBorder: "#8aa8bd",
        actorTextColor: "#1f2f3a",
        signalColor: "#5f88a3",
        labelBoxBkgColor: "#e9f0f5",
        labelBoxBorderColor: "#8aa8bd",
        loopTextColor: "#2b3a45",
        noteBkgColor: "#fdf3e6",
        noteBorderColor: "#d9b98a",
        noteTextColor: "#4a3b28",
        // 甘特图
        sectionBkgColor: "#f1f6fa",
        altSectionBkgColor: "#fdfcf9",
        taskBkgColor: "#e9f0f5",
        taskBorderColor: "#8aa8bd",
        taskTextColor: "#1f2f3a",
        // 饼图（保留一点暖色，避免全蓝）
        pie1: "#8aa8bd",
        pie2: "#a8c2d2",
        pie3: "#c2d3df",
        pie4: "#5f88a3",
        pie5: "#d9b98a",
        pie6: "#c9c1b0",
      },
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
