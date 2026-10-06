import type { Metadata } from "next"
import { ViewTransition } from "react"
import { Headphones, Star } from "lucide-react"
import { prisma } from "@/lib/prisma"
import BackLink from "@/components/ui/BackLink"

// 与相册分类页一致：新加的歌要即时可见，不做静态缓存
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "清弦 · 我喜欢的歌",
  description: "我喜欢的歌单 —— 按歌手整理",
}

export default async function MusicPage() {
  const songs = await prisma.song.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, artist: true, link: true, favorite: true },
  })

  /*
   * 按歌手分组。
   * 组的顺序 = 该歌手第一首歌出现的顺序（先加的歌手的组排在前面），
   * 组内特别推荐置顶 —— Array.prototype.sort 是稳定的，
   * 所以同为推荐或同为非推荐的歌之间仍保持添加顺序。
   */
  const groups = new Map<string, typeof songs>()
  for (const song of songs) {
    const list = groups.get(song.artist) ?? []
    list.push(song)
    groups.set(song.artist, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(b.favorite) - Number(a.favorite))
  }

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* 入口是首页「兴趣爱好」，相册总览页已删除，兜底指向首页 */}
          <BackLink fallbackHref="/" className="mb-8" />

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
              <Headphones size={32} className="text-pink-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">清弦</h1>
            <p className="text-gray-500 mt-2">我喜欢的歌</p>
            {songs.length > 0 && (
              <p className="text-sm text-gray-400 mt-2">
                共 {songs.length} 首 · {groups.size} 位歌手
              </p>
            )}
          </div>

          {groups.size === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg">🎵 还没有添加歌单</p>
              <p className="text-sm mt-2">敬请期待</p>
            </div>
          ) : (
            <div className="space-y-10">
              {[...groups.entries()].map(([artist, list]) => (
                <section key={artist}>
                  <h2 className="flex items-baseline gap-2 mb-3 pb-2 border-b border-gray-200">
                    <span className="text-base font-semibold text-gray-900">
                      {artist}
                    </span>
                    <span className="text-xs text-gray-400">{list.length} 首</span>
                  </h2>
                  <ul className="space-y-0.5">
                    {list.map((song) => (
                      <li key={song.id} className="flex items-center gap-2 py-1">
                        <Star
                          size={13}
                          className={
                            song.favorite
                              ? "shrink-0 text-amber-500"
                              : "shrink-0 text-transparent"
                          }
                          fill={song.favorite ? "currentColor" : "none"}
                          aria-label={song.favorite ? "特别推荐" : undefined}
                        />
                        <span
                          className={
                            song.favorite
                              ? "text-[15px] font-medium text-gray-900"
                              : "text-[15px] text-gray-700"
                          }
                        >
                          {song.title}
                        </span>
                        {song.link && (
                          <a
                            href={song.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            去听
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </ViewTransition>
  )
}
