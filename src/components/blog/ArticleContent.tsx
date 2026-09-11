import { renderTiptapDocument } from "@/lib/tiptap-render"

interface ArticleContentProps {
  content: string // TipTap JSON string
}

/**
 * 文章正文渲染（服务端组件）。
 *
 * 渲染完全在服务端完成，正文直接进首屏 HTML；相比改造前用只读 TipTap 实例渲染，
 * 前台不再需要下载 TipTap / ProseMirror / highlight.js。
 *
 * 外层的 `prose prose-gray max-w-none` 与改造前编辑器的 editorProps 保持一致，
 * 保证排版不变。
 */
export default function ArticleContent({ content }: ArticleContentProps) {
  return (
    <div className="prose prose-gray max-w-none">
      {renderTiptapDocument(content)}
    </div>
  )
}
