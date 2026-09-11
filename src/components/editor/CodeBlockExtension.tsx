"use client"

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import { ReactNodeViewRenderer } from "@tiptap/react"

import { lowlight } from "@/lib/highlight"

import CodeBlockView from "./CodeBlockView"

/**
 * 编辑器用的代码块扩展：语法高亮 + 语言下拉 + 复制按钮。
 *
 * `defaultLanguage: "plaintext"` 有两个作用：
 * 1. 未指定语言的代码块不再触发 `highlightAuto`。该插件在语言未注册时会用
 *    37 种语法逐个试算 —— 既慢，又会渲染出前台根本不存在的「高亮」。
 * 2. 新建代码块的 language 属性天然落到一个合法值，语言下拉不会显示空选项。
 */
const CodeBlockWithTools = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({
  lowlight,
  defaultLanguage: "plaintext",
})

export default CodeBlockWithTools
