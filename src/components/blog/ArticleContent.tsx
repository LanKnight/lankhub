"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import { useMemo } from "react"

interface ArticleContentProps {
  content: string // TipTap JSON string
}

function parseContent(content: string) {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object") return parsed
  } catch {
    // Plain text / HTML
  }
  return content
}

export default function ArticleContent({ content }: ArticleContentProps) {
  const initialContent = useMemo(() => parseContent(content), [content])

  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension,
      LinkExtension.configure({
        openOnClick: true,
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
