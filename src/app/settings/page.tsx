import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import ProfileForm from "@/components/settings/ProfileForm"
import PasswordForm from "@/components/settings/PasswordForm"

export const metadata: Metadata = {
  title: "账号设置",
  // 个人账号页不该被搜索引擎收录
  robots: { index: false, follow: false },
}

/**
 * 账号设置：所有登录用户都能用（改昵称、改密码）。
 *
 * 刻意放在 /settings 而不是 /admin/settings：后台布局要求站长或拥有任一内容权限，
 * 而注册出来的普通读者没有任何权限，进不去 —— 于是原先他们连改自己密码的入口都没有。
 */
export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?callbackUrl=/settings")

  // 从数据库读最新值（session 里那份是登录时的快照，改完昵称不会同步）
  const me = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { name: true, email: true, bio: true, role: true },
  })
  if (!me) redirect("/auth/login?callbackUrl=/settings")

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900">账号设置</h1>
        <p className="text-sm text-gray-500 mt-1">
          {me.email}
          {me.role === "OWNER" ? " · 站长" : " · 读者"}
        </p>
      </div>

      <div className="space-y-8">
        <section className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">个人资料</h2>
          <ProfileForm initialName={me.name} initialBio={me.bio ?? ""} />
        </section>

        <section className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">修改密码</h2>
          <PasswordForm />
        </section>
      </div>
    </div>
  )
}
