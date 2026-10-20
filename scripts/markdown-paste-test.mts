/*
 * Markdown 粘贴的判定与预处理测试。
 *
 * 这里测的是纯函数（`src/lib/markdown-paste.ts`），不需要浏览器。
 * 「真的粘进去变成什么样」由浏览器端验证，见文末说明。
 *
 * 用法：npx tsx scripts/markdown-paste-test.mts
 */
import {
  docToMarkdownSource,
  isAllowedImageSrc,
  isPlainTextDocument,
  looksLikeMarkdown,
  markdownToPlainNodes,
  rewriteExternalImages,
  sanitizeMarkdownDoc,
  type MarkdownNode,
} from "../src/lib/markdown-paste"

let pass = 0
const fail: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

console.log("\n【1】★ 像 markdown 的应当识别（大模型输出的典型形态）")
{
  const cases: [string, string][] = [
    ["标题 + 粗体", "## 这是一个标题\n\n这里有**粗体**文字。"],
    ["标题 + 列表", "### 小节\n\n- 第一点\n- 第二点"],
    ["围栏代码块 + 列表", "说明如下：\n\n```js\nconst a = 1\n```\n\n- 结束"],
    ["有序列表 + 链接", "1. 第一步\n2. 参考[文档](https://example.com)"],
    ["表格 + 标题", "## 对比\n\n| 项目 | 说明 |\n| --- | --- |\n| A | 甲 |"],
    ["引用 + 粗体", "> 引用一句\n\n这是**重点**。"],
  ]
  for (const [label, text] of cases) {
    check(label, looksLikeMarkdown(text), `len=${text.length}`)
  }
}

console.log("\n【2】★ 普通文章不能被误判")
{
  const cases: [string, string][] = [
    ["中文散文", "今天天气很好，我去公园散步，看到很多人在放风筝。"],
    ["带一个星号的句子", "这个函数的复杂度是 O(n) * log n，实际用得不多。"],
    ["带连字符的代码行", "const foo = a - b\nconsole.log(foo)"],
    ["太短", "# 标题"],
    ["纯数字列表符号", " 3.14 是圆周率"],
  ]
  for (const [label, text] of cases) {
    check(label, !looksLikeMarkdown(text), text.slice(0, 24).replace(/\n/g, " "))
  }
}

console.log("\n【3】脚本不能被当成 markdown")
{
  const shebang = "#!/bin/bash\n# 这是一行注释\necho hello"
  check("shebang 开头", !looksLikeMarkdown(shebang), shebang.split("\n")[0])
}

console.log("\n【4】★ 图片地址的 CSP 判断")
{
  check("本站相对路径允许", isAllowedImageSrc("/api/images/abc.jpg"))
  check("网易云 CDN 允许", isAllowedImageSrc("https://p1.music.126.net/cover.jpg"))
  check("★ 其它外链不允许", !isAllowedImageSrc("https://example.com/a.png"))
  check("★ 裸域 music.126.net 不允许（通配符要求子域名）", !isAllowedImageSrc("https://music.126.net/a.jpg"))
  check("data: 不允许（图片扩展默认拒绝 base64）", !isAllowedImageSrc("data:image/png;base64,AAAA"))
  check("javascript: 不允许", !isAllowedImageSrc("javascript:alert(1)"))
  check("协议相对 // 不允许", !isAllowedImageSrc("//evil.com/a.png"))
  check("空值不允许", !isAllowedImageSrc(""))
}

console.log("\n【5】★★ 外链图片被换成可读说明")
{
  const input = "看看这张图：\n\n![架构图](https://example.com/a.png)\n\n完。"
  const { markdown, rewritten } = rewriteExternalImages(input)
  check("识别出 1 张需要改写的图", rewritten.length === 1, `实际 ${rewritten.length}`)
  check("记录了 alt", rewritten[0]?.alt === "架构图", rewritten[0]?.alt ?? "")
  check("记录了原因 external", rewritten[0]?.reason === "external", rewritten[0]?.reason ?? "")
  check("★ 原文里的图片语法已消失", !markdown.includes("![架构图]"), markdown.replace(/\n/g, " ⏎ "))
  check("★ 变成了带说明的文字", markdown.includes("外链图片「架构图」"), "")
  check("★ 原 URL 仍在（作者要能找回它）", markdown.includes("https://example.com/a.png"))
  check("URL 被包成链接", markdown.includes("(https://example.com/a.png)"), "")
}

console.log("\n【6】本站图片与网易云封面保持原样")
{
  const input = "![本站](/api/images/x.jpg)\n\n![封面](https://p1.music.126.net/c.jpg)"
  const { markdown, rewritten } = rewriteExternalImages(input)
  check("没有图片被改写", rewritten.length === 0, `实际 ${rewritten.length}`)
  check("原本的图片语法保留", markdown === input, "")
}

console.log("\n【7】★ 内嵌 base64 图片与危险地址")
{
  const embedded = rewriteExternalImages("![截图](data:image/png;base64,AAAA)")
  check("base64 图片识别为 embedded", embedded.rewritten[0]?.reason === "embedded", embedded.rewritten[0]?.reason ?? "")
  check("★ 说明里不重复那串 base64", !embedded.markdown.includes("base64"), embedded.markdown)
  check("提示手动上传", embedded.markdown.includes("请手动上传"), embedded.markdown)

  const unsafe = rewriteExternalImages("![x](javascript:alert(1))")
  check("危险地址识别为 unsafe 或已被解析掉", unsafe.markdown.includes("不安全") || !unsafe.markdown.includes("javascript:"), unsafe.markdown)
  check("★ 不会把危险地址变成链接", !unsafe.markdown.includes("](javascript:"), unsafe.markdown)
}

console.log("\n【8】★★ 解析结果的安全性清洗")
{
  // 链接协议不安全 → 摘掉 link 标记，保留文字
  const doc: MarkdownNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "点我",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ],
  }
  const r = sanitizeMarkdownDoc(doc)
  const marks = r.content[0]?.content?.[0]?.marks
  check("★ javascript: 链接标记被移除", r.droppedLinks === 1, `droppedLinks=${r.droppedLinks}`)
  check("文字本身保留（不丢内容）", r.content[0]?.content?.[0]?.text === "点我")
  check("marks 字段被清空", marks === undefined, JSON.stringify(marks))

  // 正常 http 链接保留
  const okDoc: MarkdownNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "文档", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ],
      },
    ],
  }
  const ok = sanitizeMarkdownDoc(okDoc)
  check("http 链接保留", ok.droppedLinks === 0 && ok.content[0]?.content?.[0]?.marks?.length === 1)

  // 图片：域名不在 CSP 白名单 → 整节点丢弃
  const imgDoc: MarkdownNode = {
    type: "doc",
    content: [{ type: "image", attrs: { src: "https://example.com/a.png", alt: "x" } }],
  }
  const img = sanitizeMarkdownDoc(imgDoc)
  check("★ 白名单外的图片被丢弃", img.droppedImages === 1 && img.content.length === 0, `dropped=${img.droppedImages}`)

  const okImg = sanitizeMarkdownDoc({
    type: "doc",
    content: [{ type: "image", attrs: { src: "/api/images/a.jpg", alt: "x" } }],
  })
  check("本站图片保留", okImg.droppedImages === 0 && okImg.content.length === 1)

  const badImg = sanitizeMarkdownDoc({
    type: "doc",
    content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
  })
  check("图片协议不安全被丢弃", badImg.droppedImages === 1)
}

console.log("\n【9】嵌套结构（列表里的链接与图片）")
{
  const doc: MarkdownNode = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "危险", marks: [{ type: "link", attrs: { href: "vbscript:x" } }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const r = sanitizeMarkdownDoc(doc)
  check(
    "★ 深层嵌套里的危险链接也能被移除",
    r.droppedLinks === 1,
    `droppedLinks=${r.droppedLinks}`
  )
}

console.log("\n【10】★★ 「整理 Markdown」的冲突判定（isPlainTextDocument）")
{
  /*
   * 这是「有格式就放着不管」这条规则的核心。
   * 只有整篇都是纯文本段落时才允许整篇转换，否则会把作者手工排的版冲掉。
   */
  const plain: MarkdownNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "## 标题" }] },
      { type: "paragraph", content: [{ type: "text", text: "**粗体**正文" }] },
    ],
  }
  check("★ 全纯文本段落 → 可以整篇转换", isPlainTextDocument(plain.content ?? []))

  check(
    "段落里有 hardBreak 也算纯文本",
    isPlainTextDocument([
      { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }] },
    ])
  )

  // 有标题 → 已有格式，不允许整篇重写
  check(
    "★ 含已有标题 → 判定为冲突（不动）",
    !isPlainTextDocument([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "标题" }] },
    ])
  )

  // 有列表
  check(
    "★ 含列表 → 冲突",
    !isPlainTextDocument([
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    ])
  )

  // 有图片
  check("含图片 → 冲突", !isPlainTextDocument([{ type: "image", attrs: { src: "/a.jpg" } }]))

  // 有表格
  check(
    "含表格 → 冲突",
    !isPlainTextDocument([
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell" }] }] },
    ])
  )

  // 有代码块
  check("含代码块 → 冲突", !isPlainTextDocument([{ type: "codeBlock" }]))

  // ★ 只有粗体标记也算已有格式
  check(
    "★ 文字带粗体标记 → 冲突（说明已被手工处理过）",
    !isPlainTextDocument([
      {
        type: "paragraph",
        content: [{ type: "text", text: "粗体", marks: [{ type: "bold" }] }],
      },
    ])
  )

  // 链接标记也算
  check(
    "文字带链接标记 → 冲突",
    !isPlainTextDocument([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "链接", marks: [{ type: "link", attrs: { href: "https://a.com" } }] },
        ],
      },
    ])
  )

  check("空文档视为纯文本（可以转换）", isPlainTextDocument([]))
}

console.log("\n【11】★★ 粘贴「原样保留」与「原文拼回」互为逆运算")
{
  /*
   * 粘贴时把 markdown 当纯文本插进去（markdownToPlainNodes），
   * 点「整理」时再拼回原文（docToMarkdownSource）去解析。
   * 这两个函数必须互为逆运算，否则「整理」拿到的就不是作者原本那段 markdown。
   */
  const cases: [string, string][] = [
    ["单段", "这是一段普通文字。"],
    ["两段", "第一段。\n\n第二段。"],
    ["标题 + 段落", "## 标题\n\n下面是正文。"],
    ["列表", "- 甲\n- 乙\n- 丙"],
    ["代码块", "```js\nconst a = 1\n```"],
    ["表格", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
    ["段内单换行", "第一行\n第二行"],
  ]
  for (const [label, source] of cases) {
    const nodes = markdownToPlainNodes(source)
    const back = docToMarkdownSource(nodes)
    check(`往返一致：${label}`, back === source, back.replace(/\n/g, "⏎"))
  }

  // 关键性质：原文里的 markdown 符号必须**原样保留**（不被解释）
  const md = "## 标题\n\n**粗体**与`代码`"
  const plain = markdownToPlainNodes(md)
  const allText = JSON.stringify(plain)
  check("★ ## 被保留为字面文本", allText.includes("## 标题"))
  check("★ ** 被保留为字面文本", allText.includes("**粗体**"))
  check("★ 没有产生任何 marks（否则「整理」会因「已有格式」拒绝工作）", !allText.includes("marks"))
  check(
    "★ 结果被判定为纯文本文档",
    isPlainTextDocument(plain),
    "只有段落与文本节点"
  )

  check("空字符串产出空数组", markdownToPlainNodes("").length === 0)
  check("CRLF 被规范化", docToMarkdownSource(markdownToPlainNodes("a\r\n\r\nb")) === "a\n\nb")
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  fail.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
console.log(
  "\n说明：以上是纯函数层。「粘贴 → 点整理 → DOM 变成 <h2>/<table>/<pre>」" +
    "由 npm run editor:markdown-ui 在真实浏览器里验证。"
)
