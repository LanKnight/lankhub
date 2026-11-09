"use client"

import { useEffect, useRef, useState } from "react"

import { renderMermaid } from "@/lib/mermaid"

type RenderState = "loading" | "ready" | "error"

interface MermaidDiagramProps {
  /** mermaid 源码（来自代码块的文本内容） */
  source: string
  /** 阅读侧还是编辑器预览（只影响样式紧凑度） */
  variant?: "article" | "editor"
  /** 是否在图下方给一个「查看源码」折叠 */
  showSource?: boolean
}

/**
 * 把 mermaid 源码渲染成图。
 *
 * 设计要点：
 *  - **渲染在客户端**：`mermaid` 是重包，服务端渲染只会把首屏拖慢，
 *    而且它依赖 DOM。这里先在服务端输出占位，挂载后再渲染（站长选的方案甲）
 *  - **失败只降级不抛错**：一张图写错不该让整篇文章白屏，
 *    降级成「错误提示 + 源码」更有用
 *  - **`<noscript>` 给源码**：脚本被禁用时读者至少能看到图的内容
 */
export default function MermaidDiagram({
  source,
  variant = "article",
  showSource = true,
}: MermaidDiagramProps) {
  const [state, setState] = useState<RenderState>("loading")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    const text = source.trim()

    if (text.length === 0) {
      setState("error")
      setError("图表内容为空")
      return
    }

    setState("loading")
    setError("")

    renderMermaid(text)
      .then((clean) => {
        if (!aliveRef.current) return
        setSvg(clean)
        setState("ready")
      })
      .catch((err: unknown) => {
        if (!aliveRef.current) return
        // 只取第一行：mermaid 的语法错误会带一大坨上下文，塞进正文很难看
        const message = err instanceof Error ? err.message.split("\n")[0] : "未知错误"
        setState("error")
        setError(message)
      })

    return () => {
      aliveRef.current = false
    }
  }, [source])

  return (
    <div
      className={`mermaid-diagram mermaid-diagram-${variant}`}
      data-state={state}
    >
      <noscript>
        <pre className="mermaid-source-pre">{source}</pre>
      </noscript>

      {state === "loading" && (
        <div className="mermaid-loading" aria-busy="true">
          正在渲染图表…
        </div>
      )}

      {state === "ready" && (
        <div
          className="mermaid-canvas"
          // 内容已由 DOMPurify 按 svg 白名单清洗过（见 src/lib/mermaid.ts）
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}

      {state === "error" && (
        <div className="mermaid-error">
          <p className="mermaid-error-title">图表渲染失败：{error}</p>
          <pre className="mermaid-source-pre">{source}</pre>
        </div>
      )}

      {state === "ready" && showSource && (
        <details className="mermaid-source-details">
          <summary>查看源码</summary>
          <pre className="mermaid-source-pre">{source}</pre>
        </details>
      )}
    </div>
  )
}
