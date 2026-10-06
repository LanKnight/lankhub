import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
import { canAccessAdmin } from "@/lib/permissions"
import AdminSidebar from "@/components/layout/AdminSidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login?callbackUrl=/admin")
  }

  // 站长全权限；读者需拥有任一内容权限才能进入后台。
  // 与 Navbar 的「管理」入口共用同一套判断，不再各写一份权限清单
  if (!canAccessAdmin(user)) {
    redirect("/")
  }

  return (
    <div className="flex flex-col md:flex-row">
      {/* 会话从服务端传进去：侧栏不再先渲染空 <nav> 再水合 */}
      <AdminSidebar role={user.role} permissions={user.permissions ?? null} />
      <div className="flex-1 p-6 lg:p-8 bg-gray-50 min-h-[calc(100vh-4rem)]">
        {children}
      </div>
    </div>
  )
}
