"use client"

import { Trash2 } from "lucide-react"

import DeleteConfirmButton from "@/components/admin/DeleteConfirmButton"
import { useToast } from "@/components/ui/Toast"

interface DeleteButtonProps {
  collectionId: number
  /** 合集下的文章数（含草稿）。大于 0 时删除会把这些文章迁到「未分类」 */
  articleCount: number
  /** 兜底合集不允许删除（服务端同样会拒绝） */
  isFallback: boolean
}

export default function DeleteButton({
  collectionId,
  articleCount,
  isFallback,
}: DeleteButtonProps) {
  const { toast } = useToast()

  if (isFallback) {
    return (
      <span
        className="p-1.5 text-gray-200 cursor-not-allowed inline-block"
        title="「未分类」是兜底合集，不能删除"
        aria-label="「未分类」是兜底合集，不能删除"
      >
        <Trash2 size={16} />
      </span>
    )
  }

  return (
    <DeleteConfirmButton
      apiPath={`/api/admin/collections/${collectionId}`}
      iconTitle="删除合集"
      warning={
        articleCount > 0
          ? `该合集下 ${articleCount} 篇文章将移入「未分类」`
          : undefined
      }
      onSuccess={(data) => {
        const migrated =
          (data as { migratedArticles?: number } | null)?.migratedArticles ?? 0
        toast(
          migrated > 0
            ? `合集已删除，${migrated} 篇文章已移入「未分类」`
            : "合集已删除",
          "success"
        )
      }}
    />
  )
}
