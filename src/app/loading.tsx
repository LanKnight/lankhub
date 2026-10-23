/**
 * 全站路由加载骨架：水墨风文章卡片骨架（替代整页 spinner）。
 *
 * ⚠️ 外层必须是「一屏高」：骨架比一屏矮时，页脚会先出现在首屏里、
 * 内容流式到达后再被推到下面 —— 实测这就是首页 CLS 0.137 的来源
 * （位移元素正是 `footer.site-footer`）。撑满一屏，页脚从一开始就在折叠线下。
 */
export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 animate-pulse min-h-[calc(100vh-4rem)]">
      <div className="text-center mb-12">
        <div className="h-10 w-24 bg-gray-200 rounded mx-auto" />
        <div className="h-4 w-48 bg-gray-100 rounded mx-auto mt-4" />
      </div>
      <div className="grid gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="bg-paper border border-gray-200 p-6 space-y-4">
            <div className="h-6 w-3/5 bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-4/5 bg-gray-100 rounded" />
            <div className="flex gap-4 pt-2">
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
              <div className="h-3 w-12 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
