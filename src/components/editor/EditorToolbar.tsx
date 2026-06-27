"use client"

import type { Editor } from "@tiptap/react"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Image,
  Link,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
} from "lucide-react"

interface EditorToolbarProps {
  editor: Editor
  onAddImage: () => void
  onAddLink: () => void
}

export default function EditorToolbar({
  editor,
  onAddImage,
  onAddLink,
}: EditorToolbarProps) {
  const ToolButton = ({
    onClick,
    active = false,
    children,
    title,
  }: {
    onClick: () => void
    active?: boolean
    children: React.ReactNode
    title: string
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
        active ? "text-accent bg-accent/10" : "text-gray-600"
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-gray-200 bg-gray-50/50">
      {/* Headings */}
      <div className="flex items-center gap-0.5 mr-2">
        <ToolButton
          title="正文"
          active={editor.isActive("paragraph")}
          onClick={() =>
            editor.chain().focus().setParagraph().run()
          }
        >
          <Pilcrow size={16} />
        </ToolButton>
        <ToolButton
          title="一级标题"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 size={16} />
        </ToolButton>
        <ToolButton
          title="二级标题"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={16} />
        </ToolButton>
        <ToolButton
          title="三级标题"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 size={16} />
        </ToolButton>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Formatting */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          title="粗体"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolButton>
        <ToolButton
          title="斜体"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolButton>
        <ToolButton
          title="删除线"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolButton>
        <ToolButton
          title="行内代码"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={16} />
        </ToolButton>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Lists & Block */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          title="无序列表"
          active={editor.isActive("bulletList")}
          onClick={() =>
            editor.chain().focus().toggleBulletList().run()
          }
        >
          <List size={16} />
        </ToolButton>
        <ToolButton
          title="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
        >
          <ListOrdered size={16} />
        </ToolButton>
        <ToolButton
          title="引用"
          active={editor.isActive("blockquote")}
          onClick={() =>
            editor.chain().focus().toggleBlockquote().run()
          }
        >
          <Quote size={16} />
        </ToolButton>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Media */}
      <div className="flex items-center gap-0.5">
        <ToolButton title="插入图片" onClick={onAddImage}>
          <Image size={16} />
        </ToolButton>
        <ToolButton title="插入链接" onClick={onAddLink}>
          <Link size={16} />
        </ToolButton>
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          title="撤销"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo size={16} />
        </ToolButton>
        <ToolButton
          title="重做"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo size={16} />
        </ToolButton>
      </div>
    </div>
  )
}
