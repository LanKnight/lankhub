import Link from "next/link"

export type BlogTab = "articles" | "collections" | "moments"

const TABS: { key: BlogTab; href: string; label: string }[] = [
  { key: "articles", href: "/blog", label: "博客" },
  { key: "collections", href: "/blog/collections", label: "合集" },
  { key: "moments", href: "/blog/moments", label: "动态" },
]

/**
 * 博客区的三个标签页：博客 / 合集 / 动态。
 *
 * 为什么用「三个独立路由」而不是一个页面里切 state：
 *  - 每个标签要能单独被分享、被搜索引擎收录（合集与动态都是内容页）
 *  - 浏览器前进/后退天然正确，不用自己同步 history
 * 所以这里是三组真实链接，当前项用 aria-current 标记。
 */
export default function BlogTabs({ active }: { active: BlogTab }) {
  return (
    <nav
      aria-label="博客分区"
      className="mb-10 flex items-center justify-center gap-1.5"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-5 py-2 text-sm transition-colors ${
              isActive
                ? "bg-gray-900 font-medium text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
