import type { Metadata } from "next"
import CollectionForm from "../CollectionForm"

export const metadata: Metadata = {
  title: "新建合集 - 管理后台",
}

export default function NewCollectionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">新建合集</h1>
      <CollectionForm />
    </div>
  )
}
