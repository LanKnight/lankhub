"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import { TableKit } from "@tiptap/extension-table"
import CodeBlockWithTools from "./CodeBlockExtension"
import EditorToolbar from "./EditorToolbar"
import MarkdownPasteDialog, { type MarkdownPreview } from "./MarkdownPasteDialog"
import {
  looksLikeMarkdown,
  rewriteExternalImages,
  sanitizeMarkdownDoc,
  type MarkdownNode,
} from "@/lib/markdown-paste"
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

/** 编辑器实例。`handlePaste` 在 useEditor 配置里就要用到它，所以存进 ref */
type TipTapEditor = NonNullable<ReturnType<typeof useEditor>>

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
  // 粘贴 Markdown 弹层状态
  const [markdownOpen, setMarkdownOpen] = useState(false)
  // 编辑器实例：`handlePaste` 写在 useEditor 配置里，拿不到返回值，只能存 ref
  const editorRef = useRef<TipTapEditor | null>(null)
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

  /**
   * 把 markdown 解析成 ProseMirror 文档（不插入）。
   *
   * 解析要用编辑器注册的 schema，所以必须借它的 `markdown` 管理器 ——
   * 弹层的实时预览也走这里，保证「预览看到的」和「插入的」是同一份结果。
   */
  const previewMarkdown = useCallback((markdown: string): MarkdownPreview | null => {
    const manager = editorRef.current?.markdown
    if (!manager) return null

    try {
      // 先把「贴上去也不显示」的图片换成说明文字，再交给解析器
      const { markdown: rewritten, rewritten: images } = rewriteExternalImages(markdown)
      const doc = manager.parse(rewritten) as MarkdownNode
      const { content, droppedLinks } = sanitizeMarkdownDoc(doc)
      return { content, rewritten: images, droppedLinks }
    } catch {
      // 解析器抛错（畸形输入）时不要炸掉整个编辑器：交给调用方给提示
      return null
    }
  }, [])

  /** 把解析结果插到光标处。返回是否成功 */
  const insertMarkdown = useCallback(
    (markdown: string): boolean => {
      const editor = editorRef.current
      if (!editor) return false

      const parsed = previewMarkdown(markdown)
      if (!parsed || parsed.content.length === 0) return false

      /*
       * 传入 content 数组而不是整个 doc：
       * `doc` 是顶层节点，insertContent 会尝试把它塞进当前选区所在的位置，schema 不允许。
       */
      editor.chain().focus().insertContent(parsed.content).run()

      const notes: string[] = []
      if (parsed.rewritten.length > 0) {
        notes.push(`已转成链接说明的图片 ${parsed.rewritten.length} 张（需手动上传）`)
      }
      if (parsed.droppedLinks > 0) {
        notes.push(`移除了 ${parsed.droppedLinks} 个不安全的链接`)
      }
      if (notes.length > 0) toast(notes.join("，"), "info")

      return true
    },
    [previewMarkdown, toast]
  )

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
      TableKit,
      /*
       * Markdown 扩展只为了两件事：解析粘贴进来的 markdown、以及弹层里的预览。
       * 文章的存储格式仍然是 TipTap JSON（不用 markdown 存），
       * 所以前台渲染链路完全没变。
       */
      Markdown,
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
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard) return false

        const text = clipboard.getData("text/plain")
        if (!text) return false

        /*
         * 有条理的判断顺序，尽量不破坏现在正常的粘贴：
         *
         * 1. 剪贴板里若有**真正带格式的 HTML**，让 ProseMirror 自己解析 ——
         *    那是比 markdown 原文更准确的来源，不该抢它的活。
         * 2. 但有些界面（含部分聊天页）只是把 markdown 原文塞进 <pre> 里，
         *    HTML 的纯文本内容与 text/plain 完全相同。这种「原样包装」仍然
         *    要按 markdown 处理，否则用户看到的还是 `##`、`**`。
         * 3. 都没有才看纯文本像不像 markdown。
         */
        const html = clipboard.getData("text/html")
        if (html.length > 0) {
          const htmlText = extractTextFromHtml(html)
          const isRawWrapper = htmlText.length > 0 && htmlText.trim() === text.trim()
          if (!isRawWrapper) return false
        }

        if (!looksLikeMarkdown(text)) return false

        // 返回 true 表示「我们已经处理了粘贴」，ProseMirror 不再插入原文
        return insertMarkdown(text)
      },
    },
  })

  // 编辑器实例就绪后存进 ref（`handlePaste` 与弹层都依赖它）
  useEffect(() => {
    editorRef.current = editor ?? null
  }, [editor])

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
    /*
     * 这里刻意不写 overflow-hidden。
     *
     * 带 overflow 的元素自身就是一个滚动容器，而 position: sticky 是相对
     * 最近的滚动容器吸附的 —— 一旦加回 overflow-hidden，工具栏的 sticky
     * 就只会相对这个「永远不会滚动」的容器生效，页面滚动时它照样被滚走，
     * 表现是「样式写了但完全没反应」。
     * 卡片顶部的圆角裁切改由工具栏的 rounded-t-xl 承担。
     */
    <div className="border border-gray-200 rounded-xl bg-white">
      <EditorToolbar
        editor={editor}
        onAddImage={addImage}
        onAddLink={openLinkDialog}
        onPasteMarkdown={() => setMarkdownOpen(true)}
      />
      <EditorContent editor={editor} />
      <div className="flex items-center justify-between px-6 py-2 border-t border-gray-100 text-xs text-gray-400">
        <span>Ctrl+S 保存 · Ctrl+Alt+I 插图 · 可直接粘贴 Markdown</span>
        <span>{wordCount} 字</span>
      </div>

      {/* 粘贴 Markdown 弹层：左粘贴、右预览、确认后插入 */}
      {markdownOpen && (
        <MarkdownPasteDialog
          onClose={() => setMarkdownOpen(false)}
          preview={previewMarkdown}
          insert={insertMarkdown}
        />
      )}

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

/**
 * 取出 HTML 片段的纯文本。
 *
 * 用来判断剪贴板里的 HTML 是不是「markdown 原文的原样包装」：
 * 若它的纯文本与 text/plain 完全相同，说明 HTML 没带来额外格式，
 * 那就该按 markdown 处理。
 *
 * 用 DOMParser 而不是「塞进临时 div 再读 textContent」：
 * DOMParser 产出的是惰性文档，不会加载图片、不会执行脚本，
 * 处理来路不明的剪贴板内容更稳妥。
 */
function extractTextFromHtml(html: string): string {
  if (typeof DOMParser === "undefined") return ""
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    return doc.body?.textContent ?? ""
  } catch {
    return ""
  }
}

function tryParseContent(content: string) {  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    // 非 JSON 内容不再回退为 HTML（安全考虑）
  }
  // 返回空文档，不渲染原始字符串
  return { type: "doc", content: [] }
}

/** 递归统计 TipTap 文档的纯文本字符数 */
function countWords(node: MarkdownNode): number {
  if (!node || typeof node !== "object") return 0
  if (typeof node.text === "string") return node.text.length
  if (Array.isArray(node.content)) {
    return node.content.reduce(
      (sum: number, child: MarkdownNode) => sum + countWords(child),
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
