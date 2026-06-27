"use client"

import { RefreshCw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center space-y-5">
        <p className="text-6xl font-bold text-gray-200">500</p>
        <h1 className="text-xl font-bold text-gray-900">出错了</h1>
        <p className="text-gray-500 max-w-md">
          页面加载出现了一些问题，请稍后重试
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
        >
          <RefreshCw size={16} />
          重新加载
        </button>
      </div>
    </div>
  )
}
