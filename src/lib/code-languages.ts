export interface CodeLanguageOption {
  value: string
  label: string
}

/**
 * 编辑器语言下拉的候选项。
 *
 * 与 `lowlight`（highlight.js `common`）注册的 37 种语言一一对应。
 * “纯文本”用 `plaintext` 而不是空字符串：它是真实注册的语法、产出零高亮，
 * 同时能让新建代码块天然落到一个合法值，下拉不会出现空选项。
 */
export const CODE_LANGUAGES: ReadonlyArray<CodeLanguageOption> = [
  { value: "plaintext", label: "纯文本" },
  { value: "arduino", label: "Arduino" },
  { value: "bash", label: "Bash" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "graphql", label: "GraphQL" },
  { value: "ini", label: "INI / TOML" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "less", label: "Less" },
  { value: "lua", label: "Lua" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "objectivec", label: "Objective-C" },
  { value: "perl", label: "Perl" },
  { value: "php", label: "PHP" },
  { value: "php-template", label: "PHP 模板" },
  { value: "python", label: "Python" },
  { value: "python-repl", label: "Python REPL" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "scss", label: "SCSS" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "vbnet", label: "VB.NET" },
  { value: "wasm", label: "WebAssembly" },
  { value: "xml", label: "HTML / XML" },
  { value: "yaml", label: "YAML" },
]

const LISTED_LANGUAGES = new Set(CODE_LANGUAGES.map((language) => language.value))

/**
 * 判断语言是否在下拉列表中。
 *
 * 历史内容可能存的是别名（`js`、`sh`、`yml`…）或 `null`，此时下拉需要额外补一个
 * 临时选项，避免选中值与任何 option 都对不上而被浏览器静默重置成第一项。
 */
export function isListedLanguage(value: string): boolean {
  return LISTED_LANGUAGES.has(value)
}

/** 语言标签的显示文案：未指定与纯文本统一显示为 text */
export function formatLanguageLabel(language: string): string {
  if (!language || language === "plaintext") return "text"
  return language
}
