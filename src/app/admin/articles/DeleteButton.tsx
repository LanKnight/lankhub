"use client"

import DeleteConfirmButton from "@/components/admin/DeleteConfirmButton"

/**
 * 文章删除入口。
 *
 * 传 `confirmName`（标题原文）即进入「手写确认」模式：弹窗里要手打一遍标题，
 * 完全一致才能点删除。服务端也会比对 ?confirm= 再删一次。
 */
export default function DeleteButton({
  articleId,
  title,
}: {
  articleId: number
  title: string
}) {
  return (
    <DeleteConfirmButton
      apiPath={`/api/admin/articles/${articleId}`}
      iconTitle="删除文章"
      confirmName={title}
      resourceLabel="文章"
      warning="文章下的评论会一并删除"
    />
  )
}
