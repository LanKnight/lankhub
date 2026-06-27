import type { Metadata } from "next"
import LoginForm from "@/components/auth/LoginForm"

export const metadata: Metadata = {
  title: "登录",
}

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <LoginForm />
    </div>
  )
}
