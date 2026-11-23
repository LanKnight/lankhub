"use client"

import { useState } from "react"

/**
 * 列表行里的封面缩略图（从 SongManager 里拆出来的）。
 *
 * 只用**已入库**的 coverUrl（绑定时花 1 次配额取的），没有就显示占位方块。
 * 刻意不在这里调接口现取：官方限流 60 次 / 5 分钟，后台列表几十首歌，
 * 为了画缩略图逐条取封面会直接吃光配额 —— 配额要留给搜索与访客播放。
 *
 * 顺带记一个坑：封面的 CDN 地址形如
 * `https://p2.music.126.net/<加密哈希>/<pic_id>.jpg`，
 * 那段哈希**无法由 pic_id 推导**（实测 p2/{picId}.jpg 与
 * p2/{picId}/{picId}.jpg 都是 404），只能靠接口给。
 */
export default function SongCover({ src, size = 32 }: { src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      // 外部 CDN 域名不固定，用原生 img（已由 CSP 的 img-src 放行）
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      封面
    </span>
  )
}
