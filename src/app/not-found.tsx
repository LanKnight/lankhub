import Link from "next/link"
import { Home } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center space-y-6">
        <p className="text-8xl font-bold text-gray-200">404</p>
        <h1 className="text-2xl font-bold text-gray-900">页面不存在</h1>
        <p className="text-gray-500">你访问的页面可能已被移除或地址错误</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
        >
          <Home size={16} />
          返回首页
        </Link>
      </div>
    </div>
  )
}
