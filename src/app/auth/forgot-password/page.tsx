import type { Metadata } from "next"
import { ViewTransition } from "react"
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm"

export const metadata: Metadata = {
  title: "忘记密码",
}

/**
 * 这个页面**不需要 Suspense**：ForgotPasswordForm 没有用 useSearchParams，
 * 所以不存在「预渲染时读到 URL 数据」的问题。
 * （官方文档要求的是「在 Client Component 里调用 useSearchParams」才必须包 Suspense。）
 */
export default function ForgotPasswordPage() {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <ForgotPasswordForm />
      </div>
    </ViewTransition>
  )
}
