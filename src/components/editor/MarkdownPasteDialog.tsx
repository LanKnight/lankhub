"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardPaste, TriangleAlert } from "lucide-react"

import { renderTiptapDocument } from "@/lib/tiptap-render"
import type { MarkdownNode, RewrittenImage } from "@/lib/markdown-paste"

export interface MarkdownPreview {
  content: MarkdownNode[]
  rewritten: RewrittenImage[]
  droppedLinks: number
}

interface MarkdownPasteDialogProps {
  onClose: () => void
  /** 交给编辑器解析（需要它注册的 schema，弹层自己不持有编辑器实例） */
  preview: (markdown: string) => MarkdownPreview | null
  /** 确认插入 */
  insert: (markdown: string) => boolean
}

/**
 * 粘贴 Markdown 的弹层：左边粘贴、右边预览、确认后插入。
 *
 * 为什么还要这个弹层（既然已经有自动识别）：
 *  - 自动识别没触发的少数情况
 *  - 已经把原始 markdown 粘进正文了，想就地转换（复制出来贴进来即可）
 *  - 想**先看一眼**转换结果再决定 —— 文章排版比随手记录更要求准确
 */
export default function MarkdownPasteDialog({
  onClose,
  preview,
  insert,
}: MarkdownPasteDialogProps) {
  const [text, setText] = useState("")
  const [error, setError] = useState("")

  /*
   * 预览用防抖：长文每次击键都解析 + 渲染会把输入卡住。
   * 250ms 足够跟上手速，又不会每键都跑一遍解析。
   */
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 250)
    return () => clearTimeout(timer)
  }, [text])

  const result = useMemo(() => {
    if (debounced.trim().length === 0) return null
    return preview(debounced)
  }, [debounced, preview])

  /*
   * 预览直接复用前台正文渲染器。
   *
   * 这样「预览里看到的 = 发布后的样子」，不需要为弹层另写一套渲染，
   * 也不会出现「预览正常、发布后样式跑了」的错位。
   */
  const previewNode = useMemo(() => {
    if (!result || result.content.length === 0) return null
    return renderTiptapDocument(
      JSON.stringify({ type: "doc", content: result.content })
    )
  }, [result])

  function confirm() {
    if (text.trim().length === 0) {
      setError("请先粘贴 Markdown 内容")
      return
    }
    if (!insert(text)) {
      setError("转换失败：内容为空或解析不出任何段落")
      return
    }
    onClose()
  }

  const imageWarning = result?.rewritten.length ?? 0
  const linkWarning = result?.droppedLinks ?? 0

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <ClipboardPaste size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">粘贴 Markdown</h3>
          <span className="text-xs text-gray-400">
            支持标题、列表、表格、代码块、链接
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-gray-100 md:grid-cols-2 md:divide-x">
          <div className="flex min-h-0 flex-col">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError("")
              }}
              placeholder={"把大模型给的 Markdown 贴在这里…\n\n## 二级标题\n\n- 列表项\n\n**粗体**与`行内代码`"}
              className="min-h-[240px] flex-1 resize-none px-4 py-3 font-mono text-xs leading-relaxed text-gray-700 outline-none"
              spellCheck={false}
            />
            <div className="border-t border-gray-100 px-4 py-1.5 text-xs text-gray-400">
              {text.length} 字符
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-gray-50/50">
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {previewNode ? (
                <div className="prose prose-sm prose-gray max-w-none">
                  {previewNode}
                </div>
              ) : (
                <p className="text-xs text-gray-400">预览会显示在这里</p>
              )}
            </div>
          </div>
        </div>

        {(imageWarning > 0 || linkWarning > 0 || error) && (
          <div className="border-t border-gray-100 px-5 py-2">
            {imageWarning > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                {imageWarning} 张图片无法在当前站点显示，插入后会变成链接说明，
                需要手动上传。
              </p>
            )}
            {linkWarning > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                {linkWarning} 个链接的地址不安全（非 http/https），已自动移除。
              </p>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={text.trim().length === 0}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
          >
            插入正文
          </button>
        </div>
      </div>
    </div>
  )
}
