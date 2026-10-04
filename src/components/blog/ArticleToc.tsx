import type { TocItem } from "@/lib/tiptap-render"

/**
 * 文章目录（服务端组件）。
 *
 * 链接是静态 HTML，**没有 JS 也能正常跳转**；当前章节的高亮由 TocSpy 在客户端补上。
 */
export default function ArticleToc({
  items,
  className,
}: {
  items: TocItem[]
  className?: string
}) {
  // 以最浅的一级为基准缩进：只用了 H2/H3 的文章，H2 应该顶格而不是空一格
  const baseLevel = items.length > 0 ? Math.min(...items.map((i) => i.level)) : 1

  return (
    <nav aria-label="文章目录" className={className}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        目录
      </p>
      <ul className="border-l border-gray-200">
        {items.map((item) => (
          <li key={item.id}>
            {/*
              缩进用内联样式而不是动态类名：Tailwind 只认写死在源码里的类名，
              `pl-${n}` 这种拼接不会生成任何 CSS，是个静默失效的坑。
            */}
            <a
              href={`#${item.id}`}
              data-toc-id={item.id}
              style={{ paddingLeft: `${(item.level - baseLevel) * 12 + 12}px` }}
              className="-ml-px block border-l-2 border-transparent py-1 pr-2 text-sm leading-snug text-gray-500 hover:text-accent transition-colors data-[active=true]:border-accent data-[active=true]:font-medium data-[active=true]:text-accent"
            >
              {item.text || "（无标题）"}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
