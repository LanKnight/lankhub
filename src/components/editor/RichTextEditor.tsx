"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import EditorToolbar from "./EditorToolbar"
import { useCallback } from "react"
import { isSafeUrl } from "@/lib/utils"

interface RichTextEditorProps {
  content?: string
  onChange?: (json: string) => void
}

export default function RichTextEditor({
  content,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
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
      onChange?.(json)
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
          alert(data?.error || `上传失败 (${res.status})`)
          return
        }

        if (data?.url) {
          editor.chain().focus().setImage({ src: data.url }).run()
        }
      } catch {
        alert("网络错误：图片上传失败，请检查网络连接后重试")
      }
    }
    input.click()
  }, [editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const url = prompt("请输入链接地址：")
    if (url) {
      if (!isSafeUrl(url)) {
        alert("仅支持 http/https 链接或相对路径")
        return
      }
      editor
        .chain()
        .focus()
        .setLink({ href: url })
        .run()
    }
  }, [editor])

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
        onAddLink={addLink}
      />
      <EditorContent editor={editor} />
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
