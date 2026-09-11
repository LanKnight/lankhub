"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import CodeBlockWithTools from "./CodeBlockExtension"
import EditorToolbar from "./EditorToolbar"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react"
import { isSafeUrl } from "@/lib/utils"
import { useToast } from "@/components/ui/Toast"

export interface RichTextEditorHandle {
  /** 同步获取编辑器最新内容（绕过防抖，保存前调用避免丢失刚插入的图片等） */
  getLatestJson: () => string
}

interface RichTextEditorProps {
  content?: string
  onChange?: (json: string) => void
  ref?: Ref<RichTextEditorHandle>
}

export default function RichTextEditor({
  content,
  onChange,
  ref,
}: RichTextEditorProps) {
  const [wordCount, setWordCount] = useState(0)
  const { toast } = useToast()
  // 链接插入弹层状态
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkError, setLinkError] = useState("")
  // 防抖：长文输入时避免每次击键全量序列化 + 触发父组件重渲染
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestJson = useRef("")

  // 暴露同步读取接口：保存时绕过防抖，拿到含最新改动（如图片插入）的完整内容
  useImperativeHandle(ref, () => ({
    getLatestJson: () => latestJson.current || content || "",
  }))

  const flushChange = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (latestJson.current) onChange?.(latestJson.current)
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // 代码块换成带语法高亮 / 语言下拉 / 复制按钮的扩展
        codeBlock: false,
      }),
      CodeBlockWithTools,
      ImageExtension,
      LinkExtension.configure({
        openOnClick: false,
        validate: (href) => isSafeUrl(href),
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Placeholder.configure({
        placeholder: "开始写作...",
      }),
    ],
    content: content ? tryParseContent(content) : "",
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON())
      latestJson.current = json
      setWordCount(countWords(editor.getJSON()))
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => onChange?.(json), 300)
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-gray max-w-none focus:outline-none min-h-[300px] px-6 py-4",
      },
    },
  })

  const addImage = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !editor) return

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        const data = await safeJson(res)

        if (!res.ok) {
          toast(data?.error || `上传失败 (${res.status})`, "error")
          return
        }

        if (data?.url) {
          editor.chain().focus().setImage({ src: data.url }).run()
          toast("图片上传成功", "success")
        }
      } catch {
        toast("网络错误：图片上传失败，请检查网络连接后重试", "error")
      }
    }
    input.click()
  }, [editor, toast])

  const openLinkDialog = useCallback(() => {
    setLinkUrl("")
    setLinkError("")
    setLinkOpen(true)
  }, [])

  const confirmLink = useCallback(() => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) {
      setLinkError("请输入链接地址")
      return
    }
    if (!isSafeUrl(url)) {
      setLinkError("仅支持 http/https 链接或相对路径")
      return
    }
    editor.chain().focus().setLink({ href: url }).run()
    setLinkOpen(false)
  }, [editor, linkUrl])

  // 快捷键：Ctrl/Cmd+S 保存；Ctrl/Cmd+Alt+I 插入图片
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 保存：立即同步最新内容并提交所在表单
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        flushChange()
        editor?.view.dom.closest("form")?.requestSubmit()
        return
      }
      // 插入图片：打开文件选择框（I = Image）
      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        e.key.toLowerCase() === "i"
      ) {
        e.preventDefault()
        addImage()
      }
    }
    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [editor, flushChange, addImage])

  if (!editor) {
    return (
      <div className="border border-gray-200 rounded-xl h-[400px] animate-pulse bg-gray-50" />
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <EditorToolbar
        editor={editor}
        onAddImage={addImage}
        onAddLink={openLinkDialog}
      />
      <EditorContent editor={editor} />
      <div className="flex items-center justify-between px-6 py-2 border-t border-gray-100 text-xs text-gray-400">
        <span>Ctrl+S 保存 · Ctrl+Alt+I 插图</span>
        <span>{wordCount} 字</span>
      </div>

      {/* 链接插入弹层 */}
      {linkOpen && (
        <div
          className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center animate-fade-in"
          onClick={() => setLinkOpen(false)}
        >
          <div
            className="bg-white rounded-xl p-5 w-80 shadow-xl animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              插入链接
            </h3>
            <input
              autoFocus
              type="text"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value)
                setLinkError("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmLink()
                if (e.key === "Escape") setLinkOpen(false)
              }}
              placeholder="https://... 或 /blog/xxx"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
            />
            {linkError && (
              <p className="text-xs text-red-500 mt-1">{linkError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmLink}
                className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
              >
                插入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function tryParseContent(content: string) {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    // 非 JSON 内容不再回退为 HTML（安全考虑）
  }
  // 返回空文档，不渲染原始字符串
  return { type: "doc", content: [] }
}

/** 递归统计 TipTap 文档的纯文本字符数 */
function countWords(node: any): number {
  if (!node || typeof node !== "object") return 0
  if (typeof node.text === "string") return node.text.length
  if (Array.isArray(node.content)) {
    return node.content.reduce(
      (sum: number, child: any) => sum + countWords(child),
      0
    )
  }
  return 0
}

/**
 * 安全解析 JSON 响应，处理 Nginx 413 等非 JSON 响应
 */
async function safeJson(res: Response) {
  const contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected content type: ${contentType}`)
  }
  return res.json()
}
