"use client"

import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react"

import CopyButton from "@/components/ui/CopyButton"
import { CODE_LANGUAGES, formatLanguageLabel, isListedLanguage } from "@/lib/code-languages"

/**
 * 编辑器里的代码块 NodeView：语言下拉 + 复制按钮。
 *
 * 外观与前台 `src/components/blog/CodeBlock.tsx` 保持一致，
 * 保证「编辑器里看到的 = 发布后的样子」。
 */
export default function CodeBlockView({
  node,
  editor,
  updateAttributes,
}: ReactNodeViewProps) {
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : ""
  // 历史数据可能是 null；下拉始终对齐到一个合法选项，避免静默重置
  const selectedLanguage = language || "plaintext"

  return (
    <NodeViewWrapper
      className="code-block"
      data-language={language || undefined}
    >
      {/* 头部不能参与编辑，否则下拉和按钮会被当成正文内容 */}
      <div className="code-block-header" contentEditable={false}>
        {editor.isEditable ? (
          <select
            value={selectedLanguage}
            onChange={(event) => updateAttributes({ language: event.target.value })}
            aria-label="代码语言"
            className="code-block-lang-select"
          >
            {language && !isListedLanguage(language) && (
              <option value={language}>{language}</option>
            )}
            {CODE_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="code-block-lang">{formatLanguageLabel(language)}</span>
        )}
        <CopyButton text={node.textContent} />
      </div>
      <pre className="code-block-pre">
        {/* 显式指定泛型：`as` 被标成 NoInfer<T>，类型参数无法从它推导 */}
        <NodeViewContent<"code"> as="code" className="hljs" />
      </pre>
    </NodeViewWrapper>
  )
}
