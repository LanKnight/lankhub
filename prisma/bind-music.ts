import { config as dotenvConfig } from "dotenv"
import path from "path"

dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { getCoverUrl, getLyric, MUSIC_SOURCE, searchSongs } from "../src/lib/music-api"
import { matchSong } from "../src/lib/music-match"

/**
 * 把「还没有绑定到音乐接口」的歌，自动搜索并绑定。
 *
 * 绑定会把封面地址与歌词一并抓取入库，之后前台渲染卡片墙与歌词是零 API 调用，
 * 运行期只剩「取播放地址」一个接口。
 *
 * 关于音源：实测只有 netease 能播（kuwo 被服务端拒绝、joox 能搜不能放），
 * 详见 docs/music-plan.md，所以这里不做多音源轮询。
 *
 * 匹配刻意保守：歌名对不上就跳过，留给你在后台手动绑定 —— 错配比没配上更难发现。
 *
 * 用法：
 *   npm run db:bind-music -- --dry-run   # 只预览会绑定什么，不写入
 *   npm run db:bind-music                # 确认后执行
 *
 * 幂等：已经绑定过的歌会被跳过。
 * 每次运行最多处理 LIMIT 首（默认 20），避免一口气把官方配额打光。
 */

const dryRun = process.argv.includes("--dry-run")
/** 单次运行的歌曲上限：每首约 3 次调用（搜索 + 封面 + 歌词） */
const LIMIT = 20

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL.replace("file:", ""),
    }),
  })

  try {
    const songs = await prisma.song.findMany({
      where: { apiId: null },
      orderBy: { id: "asc" },
      take: LIMIT,
      select: { id: true, title: true, artist: true },
    })
    const totalUnbound = await prisma.song.count({ where: { apiId: null } })

    console.log(`未绑定的歌：${totalUnbound} 首，本次处理 ${songs.length} 首`)
    if (songs.length === 0) {
      console.log("没有需要绑定的歌。")
      return
    }
    if (totalUnbound > songs.length) {
      console.log(`（一次最多处理 ${LIMIT} 首，剩下的再跑一次即可）`)
    }
    if (dryRun) console.log("—— dry-run：只预览，不会写入任何数据 ——\n")

    let bound = 0
    let skipped = 0
    let failed = 0

    for (const song of songs) {
      const result = await searchSongs(song.title)
      if (!result.ok) {
        console.log(`  ✗ ${song.title} — ${song.artist}：${result.error}`)
        failed += 1
        // 配额用尽就没必要继续了
        if (result.error.includes("配额")) break
        continue
      }

      const outcome = matchSong(result.data, song.title, song.artist)
      const best = outcome.match
      if (!best) {
        // 多半是源站没有这首歌的版权（如网易云的周杰伦），标记下来免得下次白搜
        console.log(
          `  – ${song.title} — ${song.artist}：源站没有原版，无法绑定（前台会置灰）`
        )
        skipped += 1
        if (!dryRun) {
          await prisma.song.update({
            where: { id: song.id },
            data: { matchStatus: "nomatch" },
          })
        }
        continue
      }

      console.log(
        `  ✓ ${song.title} — ${song.artist}` +
          `  →  ${best.title} — ${best.artist}` +
          `${best.album ? `（${best.album}）` : ""}`
      )

      if (dryRun) {
        bound += 1
        continue
      }

      // 封面与歌词失败不阻断绑定：能不能播只取决于 apiId
      let coverUrl: string | null = null
      if (best.picId) {
        const cover = await getCoverUrl(best.picId)
        if (cover.ok) coverUrl = cover.data
      }
      let lyric: string | null = null
      if (best.lyricId) {
        const lyricResult = await getLyric(best.lyricId)
        if (lyricResult.ok) lyric = lyricResult.data
      }

      await prisma.song.update({
        where: { id: song.id },
        data: {
          source: MUSIC_SOURCE,
          apiId: best.apiId,
          picId: best.picId || null,
          lyricId: best.lyricId || null,
          album: best.album || null,
          matchStatus: null,
          ...(coverUrl ? { coverUrl } : {}),
          ...(lyric ? { lyric } : {}),
        },
      })
      bound += 1
    }

    console.log(
      dryRun
        ? `\n预览完成：可绑定 ${bound} 首，跳过 ${skipped} 首，失败 ${failed} 首`
        : `\n完成：已绑定 ${bound} 首，跳过 ${skipped} 首，失败 ${failed} 首`
    )
    if (skipped > 0) {
      console.log("跳过的那些歌名对不上，建议在后台手动挑选正确的版本。")
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("绑定失败：", error)
  process.exit(1)
})
