import type { ReactNode } from "react"

/** lowlight 产出的 hast 节点（实测只会出现 root / element(span) / text 三种） */
interface HastNode {
  type?: string
  tagName?: string
  value?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

/**
 * 把 lowlight 的 hast 转成 React 元素。
 *
 * 刻意**不**走 HTML 字符串 + `dangerouslySetInnerHTML`：
 * React 会自动转义文本节点，且这里只允许渲染 `<span>`，
 * 任何其他标签都会被丢成纯子节点，因此不存在注入面。
 */
export function hastToReact(node: unknown, key: number | string): ReactNode {
  const current = node as HastNode
  if (!current || typeof current !== "object") return null

  if (current.type === "text") {
    return current.value ?? ""
  }

  const children = current.children?.map((child, index) =>
    hastToReact(child, index)
  )

  if (current.type === "element" && current.tagName === "span") {
    const classNames = Array.isArray(current.properties?.className)
      ? current.properties.className.filter(
          (name): name is string => typeof name === "string"
        )
      : []
    return (
      <span key={key} className={classNames.join(" ") || undefined}>
        {children}
      </span>
    )
  }

  // root，或任何非 <span> 的元素：只保留子节点
  return children
}
