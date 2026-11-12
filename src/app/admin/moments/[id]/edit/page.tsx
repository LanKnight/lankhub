import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth-helpers"
import { userHasPermission } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import MomentForm from "../../MomentForm"

export const metadata: Metadata = {
  title: "编辑动态 - 管理后台",
}

export default async function EditMomentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  // 有「动态管理」权限即可（站长恒有）
  if (!userHasPermission(user, "moment")) redirect("/admin")

  const { id } = await params
  const momentId = Number.parseInt(id, 10)
  if (!Number.isInteger(momentId)) notFound()

  const moment = await prisma.moment.findUnique({
    where: { id: momentId },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  })
  if (!moment) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">编辑动态</h1>
      <MomentForm
        initial={{
          id: moment.id,
          kind: moment.kind === "poem" ? "poem" : "moment",
          topic: moment.topic,
          title: moment.title,
          text: moment.text,
          poemAuthor: moment.poemAuthor,
          poemSource: moment.poemSource,
          published: moment.published,
          sortOrder: moment.sortOrder,
          images: moment.images.map((image) => ({
            url: image.url,
            width: image.width,
            height: image.height,
          })),
        }}
      />
    </div>
  )
}
