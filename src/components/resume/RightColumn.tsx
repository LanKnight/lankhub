export default function RightColumn() {
  return (
    <div className="lg:col-span-2 space-y-10">
      {/* Education */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          教育经历
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-gray-900">XX大学</h4>
              <p className="text-sm text-gray-500 mt-0.5">计算机科学与技术 · 本科</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">2020 - 2024</span>
          </div>
        </div>
      </section>

      {/* Campus Experience */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          校园经历
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <TimelineItem
            title="学生会技术部部长"
            date="2022 - 2023"
            description="负责学校活动的技术支持，组织技术分享会，带领 10 人团队完成校园活动网站开发。"
          />
          <TimelineItem
            title="编程社团副社长"
            date="2021 - 2022"
            description="组织每周编程 Workshop，参与 ACM 校赛并获得二等奖。"
          />
        </div>
      </section>

      {/* Projects */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          项目经历
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <TimelineItem
            title="lankHub 个人博客"
            date="2025"
            description="基于 Next.js + Prisma + SQLite 构建的全栈博客系统，支持用户认证、文章管理、富文本编辑、评论功能。"
            tech="Next.js · TypeScript · Prisma · TailwindCSS"
          />
          <TimelineItem
            title="校园二手交易平台"
            date="2023"
            description="基于 React + Node.js 的校园二手物品交易平台，支持用户注册、商品发布、搜索筛选、即时通讯。"
            tech="React · Express · MongoDB · Socket.io"
          />
        </div>
      </section>

      {/* Practice */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          实践经历
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-gray-900">XX科技有限公司</h4>
              <p className="text-sm text-gray-500 mt-0.5">前端开发实习生</p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                参与公司 SaaS 产品的前端开发，负责用户管理模块的重构，
                使用 React + TypeScript 提升代码可维护性和页面性能。
              </p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">2023.07 - 2023.12</span>
          </div>
        </div>
      </section>

      {/* Awards */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          获奖荣誉
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
          <p>• 2023 年全国大学生计算机设计大赛 三等奖</p>
          <p>• 2022 年 ACM 校赛 二等奖</p>
          <p>• 2020-2023 连续三年校级奖学金</p>
        </div>
      </section>
    </div>
  )
}

function TimelineItem({
  title,
  date,
  description,
  tech,
}: {
  title: string
  date: string
  description: string
  tech?: string
}) {
  return (
    <div className="relative pl-4 border-l-2 border-gray-100">
      <div className="flex justify-between items-start">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <span className="text-xs text-gray-400 whitespace-nowrap">{date}</span>
      </div>
      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
        {description}
      </p>
      {tech && (
        <p className="text-xs text-gray-400 mt-1.5 font-mono">{tech}</p>
      )}
    </div>
  )
}
