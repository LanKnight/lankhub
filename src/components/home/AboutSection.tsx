export default function AboutSection() {
  return (
    <section id="about" className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        <h2 className="text-3xl font-bold text-gray-900">关于我</h2>
        <div className="w-16 h-1 bg-accent mx-auto rounded-full" />
        <p className="text-lg text-gray-600 leading-relaxed">
          一个热爱技术、喜欢探索新事物的开发者。
          日常沉迷于写代码、打游戏、听音乐，
          偶尔也会出去运动一下。
          相信持续学习和记录是成长的最佳方式，
          这里是我分享技术心得和生活感悟的小天地。
        </p>
        <p className="text-lg text-gray-600 leading-relaxed">
          目前在探索全栈开发、云原生和 AI 相关技术，
          希望能用代码创造出有价值的作品。
        </p>
      </div>
    </section>
  )
}
