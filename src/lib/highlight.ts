import { createLowlight, common } from "lowlight"

/**
 * 共享的 lowlight 实例（highlight.js 的 37 种常用语言）。
 *
 * 使用方有两处：
 * - 服务端 `src/lib/tiptap-render.tsx`：文章正文的静态语法高亮
 * - 编辑器 `src/components/editor/CodeBlockExtension.tsx`：编辑态所见即所得高亮
 *
 * ⚠️ `lowlight.registered()` 会解析别名（js→javascript、sh→bash、yml→yaml 等），
 * 但 `lowlight.highlight()` 遇到未注册语言会**直接抛异常**而不是降级，
 * 因此调用前必须先用 `registered()` 守卫。
 */
export const lowlight = createLowlight(common)
