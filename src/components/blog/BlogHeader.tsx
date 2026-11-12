import BlogTabs, { type BlogTab } from "./BlogTabs"

/**
 * 博客区三个标签页共用的标题区。
 *
 * 内容页（文章详情 / 合集详情）**不要**用它 —— 它们不属于列表层，
 * 带上一排标签会让人以为点进去还在列表里。
 */
export default function BlogHeader({ active }: { active: BlogTab }) {
  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900">博客</h1>
        <p className="mt-3 text-gray-500">分享技术心得与生活感悟</p>
      </div>
      <BlogTabs active={active} />
    </>
  )
}
