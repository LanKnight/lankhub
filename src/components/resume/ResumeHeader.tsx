"use client"

export default function ResumeHeader() {
  return (
    <section className="py-16 px-4 bg-gradient-to-r from-brand-navy to-gray-800 text-white">
      <div className="max-w-5xl mx-auto text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          张三
        </h1>
        <p className="text-xl text-brand-cyan font-medium">
          全栈开发工程师
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-300 pt-2">
          <span>📧 admin@lankhub.com</span>
          <span>📱 138-xxxx-xxxx</span>
          <span>📍 中国 · 上海</span>
        </div>
      </div>
    </section>
  )
}
