import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ViewTransition } from "react"
import { Headphones } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth-helpers"
import BackLink from "@/components/ui/BackLink"
import { PlayerProvider } from "@/components/music/player-context"
import ArtistGrid, { type ArtistGroup } from "@/components/music/ArtistGrid"
import PlayerBar from "@/components/music/PlayerBar"

// 与相册分类页一致：新加的歌要即时可见，不做静态缓存
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "清弦 · 我喜欢的歌",
  description: "我喜欢的歌单 —— 按歌手整理，可在线试听",
}

export default async function MusicPage() {
  /*
   * 听歌要求登录。
   *
   * 为什么放在查库之前：未登录的人连歌单都不该拿到（否则「要求登录」只是
   * 一个前端遮罩，直接请求接口照样能读全量歌单）。
   *
   * 注意这是**门槛**而不是访问控制 —— 站点注册是公开的，任何人都能注册后收听。
   * 它挡的是「路过的人 / 爬虫 / 懒得注册的人」，以及让播放行为能对应到账号。
   *
   * callbackUrl 由 LoginForm 校验为站内相对路径，登录后会跳回本页。
   */
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?callbackUrl=/music")

  const songs = await prisma.song.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      artist: true,
      favorite: true,
      coverUrl: true,
      lyric: true,
      apiId: true,
    },
  })

  /*
   * 按歌手分组。
   * 组的顺序 = 该歌手第一首歌出现的顺序（先加的歌手的组排在前面），
   * 组内特别推荐置顶 —— Array.prototype.sort 是稳定的，
   * 所以同为推荐或同为非推荐的歌之间仍保持添加顺序。
   */
  const grouped = new Map<string, typeof songs>()
  for (const song of songs) {
    const list = grouped.get(song.artist) ?? []
    list.push(song)
    grouped.set(song.artist, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => Number(b.favorite) - Number(a.favorite))
  }

  const groups: ArtistGroup[] = [...grouped.entries()].map(([artist, list]) => ({
    artist,
    songs: list.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
      lyric: song.lyric,
      favorite: song.favorite,
      apiId: song.apiId,
    })),
    // 卡片封面优先用推荐曲的，没有再退回第一首有封面的。
    // 都取自已入库的 coverUrl，因此渲染卡片墙是零 API 调用。
    coverUrl:
      (list.find((s) => s.favorite && s.coverUrl) ?? list.find((s) => s.coverUrl))
        ?.coverUrl ?? null,
    hasFavorite: list.some((s) => s.favorite),
  }))

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="min-h-screen bg-white">
        {/* pb-28 给底部固定播放条留位置 */}
        <div className="mx-auto max-w-5xl px-4 py-12 pb-28">
          <BackLink fallbackHref="/" className="mb-8" />

          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <Headphones size={32} className="text-pink-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">清弦</h1>
            <p className="mt-2 text-gray-500">我喜欢的歌</p>
            {songs.length > 0 && (
              <p className="mt-2 text-sm text-gray-400">
                共 {songs.length} 首 · {groups.length} 位歌手
              </p>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <p className="text-lg">🎵 还没有添加歌单</p>
              <p className="mt-2 text-sm">敬请期待</p>
            </div>
          ) : (
            <PlayerProvider>
              <ArtistGrid groups={groups} />
              <PlayerBar />
            </PlayerProvider>
          )}

          {/* 来源标注：第三方接口要求注明数据来源 */}
          <p className="mt-12 text-center text-xs leading-relaxed text-gray-400">
            音乐数据来源于第三方免费接口 GD音乐台，仅供个人学习与欣赏，
            版权归原始版权方所有 ·{" "}
            <Link
              href="/music/disclaimer"
              className="underline transition-colors hover:text-gray-600"
            >
              免责声明
            </Link>
          </p>
        </div>
      </div>
    </ViewTransition>
  )
}
