"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import ImageExtension from "@tiptap/extension-image"
import LinkExtension from "@tiptap/extension-link"
import { useEffect } from "react"

interface ArticleContentProps {
  content: string // TipTap JSON string
}

export default function ArticleContent({ content }: ArticleContentProps) {
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
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none",
      },
    },
  })

  useEffect(() => {
    if (editor && content) {
      try {
        const json = JSON.parse(content)
        editor.commands.setContent(json)
      } catch {
        // If content is plain HTML/text, set it directly
        editor.commands.setContent(content)
      }
    }
  }, [editor, content])

  if (!editor) {
    return <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />
  }

  return <EditorContent editor={editor} />
}
