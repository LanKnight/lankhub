import type { Metadata } from "next"
import RegisterForm from "@/components/auth/RegisterForm"

export const metadata: Metadata = {
  title: "注册",
}

export default function RegisterPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <RegisterForm />
    </div>
  )
}
