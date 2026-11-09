"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2, X } from "lucide-react"

import { renderMermaid } from "@/lib/mermaid"

type RenderState = "loading" | "ready" | "error"

/**
 * 从 mermaid 产出的 SVG 里读出「原始宽度」（viewBox 的第三段）。
 *
 * 放大层需要按原始尺寸显示。为什么不靠 CSS：
 *  - mermaid 会给 svg 写内联 `max-width: <原始宽>px; width: 100%`
 *  - 面板宽度又是"由内容决定"的，于是 `width: auto/100%` 会绕成循环，实测宽度为 0
 * 所以直接算出数值宽度，显式设给容器。
 */
function naturalWidthOf(svg: string): number | null {
  const match = svg.match(/viewBox="([^"]+)"/)
  if (!match) return null
  const parts = match[1].split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || !Number.isFinite(parts[2]) || parts[2] <= 0) return null
  return Math.ceil(parts[2])
}

interface MermaidDiagramProps {
  /** mermaid 源码（来自代码块的文本内容） */
  source: string
  /** 阅读侧还是编辑器预览（只影响样式与是否可放大） */
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
 *  - **点击放大**：宽图（如 8 节点的 LR 流程图）按容器宽度缩放后字会小到看不清，
 *    所以图可以点开一个覆盖层按原始尺寸查看（阅读侧才有，编辑器预览不加）
 */
export default function MermaidDiagram({
  source,
  variant = "article",
  showSource = true,
}: MermaidDiagramProps) {
  const [state, setState] = useState<RenderState>("loading")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [zoomed, setZoomed] = useState(false)
  const aliveRef = useRef(true)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

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

  const closeZoom = useCallback(() => {
    setZoomed(false)
    // 关闭后焦点回到触发按钮，键盘用户不至于丢失位置
    triggerRef.current?.focus()
  }, [])

  // 放大层打开时：锁滚动、Esc 关闭、焦点移到关闭按钮
  useEffect(() => {
    if (!zoomed) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeZoom()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [zoomed, closeZoom])

  const zoomable = variant === "article" && state === "ready"
  const zoomWidth = state === "ready" ? naturalWidthOf(svg) : null

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
        <>
          {zoomable ? (
            <button
              type="button"
              ref={triggerRef}
              className="mermaid-zoom-trigger"
              onClick={() => setZoomed(true)}
              title="点击放大查看"
              aria-label="放大查看图表"
            >
              <div
                className="mermaid-canvas"
                // 内容已由 src/lib/mermaid.ts 的 sanitizeSvg 清洗过
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <span className="mermaid-zoom-hint" aria-hidden="true">
                <Maximize2 size={13} />
                点击放大
              </span>
            </button>
          ) : (
            <div
              className="mermaid-canvas"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </>
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

      {zoomed && (
        <div
          className="mermaid-zoom-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="放大的图表"
          onClick={(event) => {
            // 只有点到背景才关闭，点图本身不关
            if (event.target === event.currentTarget) closeZoom()
          }}
        >
          <div className="mermaid-zoom-panel">
            <button
              type="button"
              ref={closeRef}
              className="mermaid-zoom-close"
              onClick={closeZoom}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
            {/* 覆盖层里按原始宽度显示；超出面板就在面板内滚动 */}
            <div
              className="mermaid-zoom-canvas"
              style={zoomWidth ? { width: `${zoomWidth}px` } : undefined}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
