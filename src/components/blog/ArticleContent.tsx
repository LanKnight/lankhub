"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import { useMemo } from "react"
import { isSafeUrl } from "@/lib/utils"

interface ArticleContentProps {
  content: string // TipTap JSON string
}

function parseContent(content: string) {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    // 非 JSON 内容不回退为 HTML 渲染（防止存储型 XSS）
  }
  // 安全回退：显示为空文档
  return { type: "doc", content: [] }
}

export default function ArticleContent({ content }: ArticleContentProps) {
  const initialContent = useMemo(() => parseContent(content), [content])

  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension,
      LinkExtension.configure({
        openOnClick: true,
        validate: (href) => isSafeUrl(href),
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    content: initialContent,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none",
      },
    },
  })

  if (!editor) {
    return <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />
  }

  return <EditorContent editor={editor} />
}
