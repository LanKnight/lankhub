"use client"

import { useState } from "react"
import { ChevronDown, Headphones, Pause, Play, Star } from "lucide-react"
import { usePlayer, type PlayerSong } from "./player-context"

export interface ArtistGroup {
  artist: string
  songs: PlayerSong[]
  /** 该歌手推荐曲的封面，取自已入库的 coverUrl（零 API 调用） */
  coverUrl: string | null
  hasFavorite: boolean
}

/**
 * 歌手卡片墙：首屏只有卡片，点某张卡片就地展开那位歌手的歌。
 *
 * 展开方式用 col-span-full 让卡片横跨整行，而不是弹窗或跳页 ——
 * 这样既符合「点卡片再出现音乐」的预期，也不丢失当前浏览位置。
 */
export default function ArtistGrid({ groups }: { groups: ArtistGroup[] }) {
  const { current, playing, play, toggle } = usePlayer()
  const [openArtist, setOpenArtist] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {groups.map((group) => {
        const isOpen = openArtist === group.artist
        return (
          <div
            key={group.artist}
            className={
              isOpen
                ? "col-span-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                : "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            }
          >
            <button
              type="button"
              onClick={() => setOpenArtist(isOpen ? null : group.artist)}
              className={
                isOpen
                  ? "flex w-full items-center gap-4 text-left"
                  : "flex w-full flex-col items-center gap-3 text-center"
              }
              aria-expanded={isOpen}
            >
              <span
                className={
                  isOpen
                    ? "h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100"
                    : "h-20 w-20 overflow-hidden rounded-xl bg-gray-100"
                }
              >
                {group.coverUrl ? (
                  // 外部 CDN 域名不固定，用原生 img（已由 CSP 的 img-src 放行）
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={group.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-gray-300">
                    <Headphones size={isOpen ? 20 : 26} />
                  </span>
                )}
              </span>

              <span className={isOpen ? "min-w-0 flex-1" : "w-full"}>
                <span className="flex items-center gap-1.5 justify-center">
                  {group.hasFavorite && (
                    <Star size={12} className="shrink-0 text-amber-500" fill="currentColor" />
                  )}
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {group.artist}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-gray-400">
                  {group.songs.length} 首
                </span>
              </span>

              {isOpen && (
                <ChevronDown size={18} className="shrink-0 rotate-180 text-gray-400" />
              )}
            </button>

            {isOpen && (
              <ul className="mt-4 animate-rise-in space-y-0.5 border-t border-gray-100 pt-3">
                {group.songs.map((song) => {
                  const isCurrent = current?.id === song.id
                  const isPlayingThis = isCurrent && playing
                  return (
                    <li key={song.id}>
                      <button
                        type="button"
                        onClick={() =>
                          isCurrent ? toggle() : play(song, group.songs)
                        }
                        className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          isCurrent ? "bg-gray-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {isPlayingThis ? (
                            <Pause size={13} className="text-gray-900" />
                          ) : (
                            <Play
                              size={13}
                              className={
                                isCurrent
                                  ? "text-gray-900"
                                  : "text-gray-300 group-hover:text-gray-500"
                              }
                            />
                          )}
                        </span>
                        {song.favorite && (
                          <Star
                            size={11}
                            className="shrink-0 text-amber-500"
                            fill="currentColor"
                          />
                        )}
                        <span
                          className={`truncate text-sm ${
                            isCurrent ? "font-medium text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {song.title}
                        </span>
                        {!song.apiId && (
                          <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-400 ring-1 ring-gray-200">
                            待绑定
                          </span>
                        )}
                        {song.link && song.apiId && (
                          <a
                            href={song.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-auto shrink-0 text-[11px] text-accent hover:underline"
                          >
                            外链
                          </a>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
