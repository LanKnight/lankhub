import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { isEmailEnabled } from "@/lib/email/sender"
import PasswordForm from "@/components/settings/PasswordForm"

export const metadata: Metadata = {
  title: "修改密码",
  robots: { index: false, follow: false },
}

/** 修改密码：从 /settings 首页拆出来的独立页 */
export default async function PasswordSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?callbackUrl=/settings/password")

  const me = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { email: true, emailVerifiedAt: true },
  })
  if (!me) redirect("/auth/login?callbackUrl=/settings/password")

  /*
   * 邮件功能是否可用由**服务端**判断后传下去。
   * 客户端组件读不到非 NEXT_PUBLIC_ 的环境变量，硬读会得到 undefined
   * 并误判成「已关闭」—— 那种 bug 只在生产环境出现，很难查。
   */
  const emailEnabled = isEmailEnabled()

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700"
      >
        <ArrowLeft size={14} />
        返回设置
      </Link>

      <h1 className="mb-8 text-2xl font-bold text-gray-900">修改密码</h1>

      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <PasswordForm
          email={me.email}
          emailVerified={me.emailVerifiedAt !== null}
          emailEnabled={emailEnabled}
        />
      </section>
    </div>
  )
}
