import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import SongManager from "./SongManager"

export const metadata: Metadata = {
  title: "歌单管理 - 管理后台",
}

export default async function AdminMusicPage() {
  // 歌单是站长私人的收藏：后台侧栏对非站长隐藏该项，这里再独立守一道，
  // 免得有人直接敲 URL 进来
  const user = await getCurrentUser()
  if (user?.role !== "OWNER") redirect("/admin")

  const songs = await prisma.song.findMany({
    orderBy: [{ artist: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    // 在线播放相关的字段必须一起 select：界面要据此显示绑定状态徽标与封面缩略图
    select: {
      id: true,
      title: true,
      artist: true,
      favorite: true,
      apiId: true,
      matchStatus: true,
      coverUrl: true,
      picId: true,
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">歌单管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          管理首页「清弦」栏目的歌单。用「搜索添加」搜歌名、挑一个版本加入即可，
          歌手与封面会自动带出来；保存后前台立即生效
        </p>
      </div>

      <SongManager initialSongs={songs} />
    </div>
  )
}
