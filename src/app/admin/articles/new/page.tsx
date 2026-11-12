import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
import { userHasPermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { pagedHref } from "@/lib/utils"
import BackLink from "@/components/ui/BackLink"
import ArticleForm from "../ArticleForm"

export const metadata: Metadata = {
  title: "新建文章 - 管理后台",
}

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const authUser = await getCurrentUser()
  // 没有「文章管理」权限就别进文章模块（站长恒有）
  if (!userHasPermission(authUser, "article")) redirect("/admin")

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1") || 1)
  // 保存后回到来的那一页，而不是固定跳第 1 页
  const returnTo = pagedHref("/admin/articles", page)

  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="space-y-6">
      <BackLink fallbackHref={returnTo} />
      <h1 className="text-2xl font-bold text-gray-900">新建文章</h1>
      <ArticleForm collections={collections} returnTo={returnTo} />
    </div>
  )
}
