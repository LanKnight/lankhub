"use client"

import { useEffect, useState } from "react"
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react"

import MermaidDiagram from "@/components/blog/MermaidDiagram"
import CopyButton from "@/components/ui/CopyButton"
import { CODE_LANGUAGES, formatLanguageLabel, isListedLanguage } from "@/lib/code-languages"
import { isMermaidLanguage } from "@/lib/mermaid"

/** 预览的防抖间隔：改代码时不要每敲一个字就重渲染一次图 */
const PREVIEW_DEBOUNCE_MS = 400

/**
 * 编辑器里的代码块 NodeView：语言下拉 + 复制按钮。
 *
 * 外观与前台 `src/components/blog/CodeBlock.tsx` 保持一致，
 * 保证「编辑器里看到的 = 发布后的样子」。
 *
 * 语言选到 mermaid 时，代码块下方额外给一个**实时预览**（防抖 400ms）：
 * 写图时不用先发布才知道画成什么样。
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

  const isMermaid = isMermaidLanguage(language)
  const source = node.textContent
  const [previewSource, setPreviewSource] = useState("")

  useEffect(() => {
    if (!isMermaid) {
      setPreviewSource("")
      return
    }
    // 只在停顿后再渲染，避免每次按键都触发 mermaid 解析
    const timer = setTimeout(() => setPreviewSource(source), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [isMermaid, source])

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

      {/*
        mermaid 预览：contentEditable=false 让点击与输入都落回上面的代码区，
        否则预览里的图会被当成可编辑内容。
      */}
      {isMermaid && (
        <div className="code-block-preview" contentEditable={false}>
          {previewSource ? (
            <MermaidDiagram source={previewSource} variant="editor" showSource={false} />
          ) : (
            <div className="mermaid-loading" aria-busy="true">
              正在解析图表…
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}
