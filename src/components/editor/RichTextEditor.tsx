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
import {
  isPlainTextDocument,
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

/** 解析结果。图片被改写、链接被移除的数量用于事后提示 */
interface MarkdownParse {
  content: MarkdownNode[]
  rewritten: { alt: string; url: string; reason: string }[]
  droppedLinks: number
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
   * 解析要用编辑器注册的 schema，所以必须借它的 `markdown` 管理器。
   * 粘贴与「整理」两个入口共用这里，保证行为一致。
   */
  const previewMarkdown = useCallback((markdown: string): MarkdownParse | null => {
    const manager = editorRef.current?.markdown
    if (!manager) return null

    try {
      // 先把「贴上去也不显示」的图片换成说明文字，再交给解析器
      const { markdown: rewritten, rewritten: images } = rewriteExternalImages(markdown)
      const doc = manager.parse(rewritten) as MarkdownNode
      const { content, droppedLinks } = sanitizeMarkdownDoc(doc)
      return { content, rewritten: images, droppedLinks }
    } catch {
      // 解析器抛错（畸形输入）时不要炸掉整个编辑器：交给调用方决定怎么处理
      return null
    }
  }, [])

  /** 解析结果里的副作用（图片被改写、危险链接被移除）需要告诉作者 */
  const notifyMarkdownIssues = useCallback(
    (parsed: MarkdownParse) => {
      const notes: string[] = []
      if (parsed.rewritten.length > 0) {
        notes.push(`已转成链接说明的图片 ${parsed.rewritten.length} 张（需手动上传）`)
      }
      if (parsed.droppedLinks > 0) {
        notes.push(`移除了 ${parsed.droppedLinks} 个不安全的链接`)
      }
      if (notes.length > 0) toast(notes.join("，"), "info")
    },
    [toast]
  )

  /** 把 markdown 解析后插到光标处（替换当前选区）。返回是否成功 */
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
      notifyMarkdownIssues(parsed)
      return true
    },
    [previewMarkdown, notifyMarkdownIssues]
  )

  /**
   * 「整理 Markdown」：把编辑器里**已经是 markdown 的纯文本**就地转成富文本。
   *
   * ## 为什么不弹一个框让作者再粘一次
   *
   * 那等于把「粘贴」做两遍。作者的诉求是「我已经粘进来了，帮我把 `##`、`**`
   * 这些符号整理掉」，所以这个按钮应当作用在**已有内容**上。
   *
   * ## 判定顺序（保守优先）
   *
   * 1. **有选中文本** → 只转换选区，其余内容一个字节都不动
   * 2. 无选中且**整篇都是纯文本** → 整篇转换（这正是「刚粘进来还没整理」的形态）
   * 3. 无选中但**已有格式**（标题/列表/图片/表格/代码块/粗体…）→ **放着不动**
   * 4. 看起来不是 markdown、或解析失败 → **放着不动**
   *
   * 第 3 条是刻意保守：整篇重写会把作者手工调过的排版全部冲掉，
   * 那才是真正的「冲突」。处理不了就什么都不改，只给一条灰色提示说明原因。
   */
  const convertMarkdownInPlace = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const { from, to, empty } = editor.state.selection

    // ---- 1. 有选区：只处理选区 ----
    if (!empty) {
      const selected = editor.state.doc.textBetween(from, to, "\n")
      if (!looksLikeMarkdown(selected)) {
        toast("选中的内容看起来不是 Markdown，未做改动", "info")
        return
      }
      const parsed = previewMarkdown(selected)
      if (!parsed || parsed.content.length === 0) {
        toast("选中的内容无法解析，未做改动", "info")
        return
      }
      // insertContent 在选区非空时是「替换」，不会把原文留在旁边
      editor.chain().focus().insertContent(parsed.content).run()
      notifyMarkdownIssues(parsed)
      return
    }

    // ---- 2/3. 无选区：只有整篇纯文本才整体转换 ----
    const doc = editor.getJSON() as MarkdownNode
    if (!isPlainTextDocument(doc.content ?? [])) {
      toast("正文里已有格式，未做改动（可先选中要转换的段落再点）", "info")
      return
    }

    const text = editor.getText({ blockSeparator: "\n\n" })
    if (!looksLikeMarkdown(text)) {
      toast("没有检测到可转换的 Markdown 内容", "info")
      return
    }

    const parsed = previewMarkdown(text)
    if (!parsed || parsed.content.length === 0) {
      toast("内容无法解析，未做改动", "info")
      return
    }

    editor.commands.setContent({ type: "doc", content: parsed.content })
    notifyMarkdownIssues(parsed)
  }, [previewMarkdown, notifyMarkdownIssues, toast])

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
         * 2. 但有些界面只是把 markdown 原文用 `<p>` 之类包了一层，
         *    HTML 的纯文本内容与 text/plain 相同（只差空白）。这种「原样包装」
         *    仍然要按 markdown 处理，否则用户看到的还是 `##`、`**`。
         * 3. 都没有才看纯文本像不像 markdown。
         *
         * ⚠️ 第 2 步必须**先去掉所有空白再比较**。
         * `<p>## 标题</p><p>正文</p>` 的 textContent 是「## 标题正文」——
         * 段落之间的换行没了，与 `text/plain` 的 `## 标题\n\n正文` 直接比是不相等的。
         * 原来就是这么比的，导致这类剪贴板被误判成「有真正格式」而不转换
         * （很多聊天界面复制出来正是 `<p>` 包裹的形态）。
         */
        const html = clipboard.getData("text/html")
        if (html.length > 0) {
          const htmlText = extractTextFromHtml(html)
          const isRawWrapper =
            compressWhitespace(htmlText).length > 0 &&
            compressWhitespace(htmlText) === compressWhitespace(text)
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
        onConvertMarkdown={convertMarkdownInPlace}
      />
      <EditorContent editor={editor} />
      <div className="flex items-center justify-between px-6 py-2 border-t border-gray-100 text-xs text-gray-400">
        <span>Ctrl+S 保存 · Ctrl+Alt+I 插图 · 可直接粘贴 Markdown</span>
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

/**
 * 去掉所有空白字符。
 *
 * 用于比较「剪贴板里 HTML 的纯文本」与 `text/plain` 是不是同一份内容 ——
 * HTML 的段落分隔在 textContent 里是不留换行的，直接比较会永远不相等。
 * 只比较**非空白字符**，才真正反映「有没有丢失格式」。
 */
function compressWhitespace(value: string): string {
  return value.replace(/\s+/g, "")
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
