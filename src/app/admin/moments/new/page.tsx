import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth-helpers"
import { userHasPermission } from "@/lib/permissions"
import MomentForm from "../MomentForm"

export const metadata: Metadata = {
  title: "新建动态 - 管理后台",
}

export default async function NewMomentPage() {
  const user = await getCurrentUser()
  // 有「动态管理」权限即可（站长恒有）
  if (!userHasPermission(user, "moment")) redirect("/admin")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">新建动态</h1>
      <MomentForm />
    </div>
  )
}
