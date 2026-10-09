"use client"

import { useMemo, useState } from "react"
import { ChevronDown, CircleAlert, Headphones, Pause, Play, Shuffle, Star } from "lucide-react"
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
  const { current, playing, play, toggle, setMode } = usePlayer()
  const [openArtist, setOpenArtist] = useState<string | null>(null)

  /*
   * 「播放全部」的队列：把各组里**能播的**歌按当前顺序摊平。
   *
   * 为什么必须过滤掉不可播的（apiId 为空、前台置灰的那些）：
   * 它们进队列后，「下一首」会走进一首放不出声的歌，然后卡在错误提示上。
   * 歌单一多这种情况就很显眼（网易云没版权那批全都不可播）。
   */
  const { playable, unplayableCount } = useMemo(() => {
    const ok: PlayerSong[] = []
    let bad = 0
    for (const group of groups) {
      for (const song of group.songs) {
        if (song.apiId) ok.push(song)
        else bad += 1
      }
    }
    return { playable: ok, unplayableCount: bad }
  }, [groups])

  /** 从整个队列的第一首开始播；random 为真时直接进入随机模式 */
  function playAll(random: boolean) {
    if (playable.length === 0) return
    setMode(random ? "shuffle" : "sequential")
    play(playable[0], playable)
  }

  return (
    <>
      {/* 播放全部：整站可播的歌合成一个队列，跨歌手连着放 */}
      {playable.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-100 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => playAll(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <Play size={15} className="ml-0.5" />
            播放全部
          </button>
          <button
            type="button"
            onClick={() => playAll(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            <Shuffle size={14} />
            随机播放
          </button>
          <span className="text-xs text-gray-400">{playable.length} 首可播放</span>
          {unplayableCount > 0 && (
            <span
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-600"
              title="这些歌源站没有原版（或还没绑定），点不出声音，所以不会进入播放队列"
            >
              <CircleAlert size={13} className="shrink-0" />
              {unplayableCount} 首暂不可播，已跳过
            </span>
          )}
        </div>
      )}

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
                  /*
                   * 未绑定 = 本站没有这首歌的版本，直接置灰不可点。
                   * 不做的两件事：一是不再给「去别处听」的外链（歌单已无外链字段），
                   * 二是不让它进播放队列 —— 否则「下一首」会走进一首放不出的歌。
                   */
                  const canPlay = Boolean(song.apiId)
                  return (
                    <li key={song.id}>
                      <button
                        type="button"
                        disabled={!canPlay}
                        title={canPlay ? undefined : "本站无此版本"}
                        onClick={() =>
                          isCurrent ? toggle() : play(song, group.songs.filter((s) => s.apiId))
                        }
                        className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          canPlay
                            ? isCurrent
                              ? "bg-gray-50"
                              : "hover:bg-gray-50"
                            : "cursor-not-allowed opacity-50"
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
                                  : canPlay
                                    ? "text-gray-300 group-hover:text-gray-500"
                                    : "text-gray-300"
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
                        {!canPlay && (
                          <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                            本站无此版本
                          </span>
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
    </>
  )
}
