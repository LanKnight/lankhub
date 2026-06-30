import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import CollectionForm from "../../CollectionForm"

export const metadata: Metadata = {
  title: "编辑合集 - 管理后台",
}

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const collection = await prisma.collection.findUnique({
    where: { id: parseInt(id) },
  })

  if (!collection) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">编辑合集</h1>
      <CollectionForm
        initialData={{
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description || "",
          coverImage: collection.coverImage || "",
          sortOrder: collection.sortOrder,
        }}
      />
    </div>
  )
}
