import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import ProfileForm from "@/components/settings/ProfileForm"

export const metadata: Metadata = {
  title: "个人资料",
  robots: { index: false, follow: false },
}

/** 个人资料：从 /settings 首页拆出来的独立页 */
export default async function ProfileSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?callbackUrl=/settings/profile")

  const me = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { name: true, bio: true },
  })
  if (!me) redirect("/auth/login?callbackUrl=/settings/profile")

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700"
      >
        <ArrowLeft size={14} />
        返回设置
      </Link>

      <h1 className="mb-8 text-2xl font-bold text-gray-900">个人资料</h1>

      <section className="rounded-xl border border-gray-100 bg-white p-6">
        <ProfileForm initialName={me.name} initialBio={me.bio ?? ""} />
      </section>
    </div>
  )
}
