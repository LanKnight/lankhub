import type { ReactNode } from "react"

import CopyButton from "@/components/ui/CopyButton"
import { formatLanguageLabel } from "@/lib/code-languages"

interface CodeBlockProps {
  /** 未高亮的原始代码，用于复制 */
  code: string
  /** TipTap codeBlock 的 language 属性，可能为空 */
  language: string
  /** 已在服务端高亮好的内容（hast → React） */
  children: ReactNode
}

/**
 * 代码块外壳：语言标签 + 复制按钮 + 高亮内容。
 *
 * 这是个**服务端组件** —— 高亮后的代码作为 children 直接进首屏 HTML，
 * 整个正文里只有 `CopyButton` 会进入客户端包。
 */
export default function CodeBlock({ code, language, children }: CodeBlockProps) {
  // 语言名来自用户输入，只保留语言标识里的合法字符后再拼进 class
  const safeLanguage = language.replace(/[^a-zA-Z0-9+#-]/g, "")

  return (
    <div className="code-block" data-language={safeLanguage || undefined}>
      <div className="code-block-header">
        <span className="code-block-lang">{formatLanguageLabel(language)}</span>
        <CopyButton text={code} />
      </div>
      <pre className="code-block-pre">
        <code
          className={safeLanguage ? `hljs language-${safeLanguage}` : "hljs"}
        >
          {children}
        </code>
      </pre>
    </div>
  )
}
