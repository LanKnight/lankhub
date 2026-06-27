import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
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

  if (user.role !== "OWNER") {
    redirect("/")
  }

  return (
    <div className="flex">
      <AdminSidebar />
      <div className="flex-1 p-6 lg:p-8 bg-gray-50 min-h-[calc(100vh-4rem)]">
        {children}
      </div>
    </div>
  )
}
