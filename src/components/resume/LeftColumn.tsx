export default function LeftColumn() {
  return (
    <div className="lg:col-span-1 space-y-8">
      {/* Personal Info */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          基本信息
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
          <p><span className="font-medium text-gray-800">出生年月：</span>2000.01</p>
          <p><span className="font-medium text-gray-800">籍贯：</span>浙江 · 杭州</p>
          <p><span className="font-medium text-gray-800">学历：</span>本科</p>
          <p><span className="font-medium text-gray-800">政治面貌：</span>共青团员</p>
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          专业技能
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          {[
            { name: "React / Next.js", level: 90 },
            { name: "TypeScript / JavaScript", level: 88 },
            { name: "Node.js / Express", level: 82 },
            { name: "Python", level: 75 },
            { name: "Docker / DevOps", level: 70 },
          ].map((skill) => (
            <div key={skill.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">{skill.name}</span>
                <span className="text-gray-400 text-xs">{skill.level}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-brand-cyan rounded-full transition-all"
                  style={{ width: `${skill.level}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Certificates */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          证书
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
          <p>• CET-6 英语六级</p>
          <p>• 计算机二级</p>
          <p>• AWS Cloud Practitioner</p>
        </div>
      </section>

      {/* Self Evaluation */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          自我评价
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-600 leading-relaxed">
          热爱技术，自主学习能力强，善于团队协作。
          对代码质量有追求，注重用户体验。
          保持好奇心，持续探索新技术。
        </div>
      </section>
    </div>
  )
}
