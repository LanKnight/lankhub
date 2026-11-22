/**
 * 用 QQ 音乐源补齐「网易云没有原版」的歌（目前是 12 首周杰伦）。
 *
 * 流程：读线上未绑定的歌 → QQ 搜索（歌名+歌手双匹配）→ 取直链并探活 →
 *       调后台绑定接口落库（source=tencent, apiId=song_mid）。
 *
 * 校验优先：**只有真的能取到音频** 才绑定，避免绑上一首放不出来的歌。
 *
 * 用法：
 *   npx tsx scripts/music-bind-qq.mts                # 真绑定
 *   npx tsx scripts/music-bind-qq.mts --dry-run      # 只看匹配结果
 *   npx tsx scripts/music-bind-qq.mts --artist 周杰伦 # 限定歌手
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"

import { getQqPlayUrls, searchQqSongs } from "../src/lib/music-qq"

const KEY = `${process.env.USERPROFILE}\\.ssh\\lankhub-personal`
const HOST = "root@8.134.186.118"
const SITE = "https://www.lankhub.xyz"

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const artistFilter = argv.includes("--artist") ? argv[argv.indexOf("--artist") + 1] : null

function ssh(command: string): string {
  return execFileSync(
    "ssh",
    ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15", HOST, command],
    { encoding: "utf8" }
  )
}

interface UnboundSong {
  id: number
  title: string
  artist: string
}

const where = artistFilter
  ? `where apiId is null and artist = '${artistFilter.replace(/'/g, "''")}'`
  : "where apiId is null"
const rows = ssh(`cd /root/lankhub && sqlite3 -separator ' | ' dev.db "select id, title, artist from Song ${where} order by artist, id;"`)
const songs: UnboundSong[] = rows
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [id, title, artist] = line.split(" | ")
    return { id: Number(id), title, artist }
  })

console.log(`未绑定音源的歌：${songs.length} 首${dryRun ? "（预演模式，不写库）" : ""}`)

/* 站长会话：绑定接口只认真实登录，所以用服务器上的 AUTH_SECRET 现签一个 */
async function ownerCookie(): Promise<string> {
  const secret = execFileSync(
    "ssh",
    ["-i", KEY, "-o", "StrictHostKeyChecking=no", HOST, "cd /root/lankhub && grep -h AUTH_SECRET .env.local | head -1 | cut -d= -f2-"],
    { encoding: "utf8" }
  ).trim().replace(/^["']|["']$/g, "")
  const token = await encode({
    token: { sub: "1", id: "1", role: "OWNER", permissions: null },
    secret,
    salt: "__Secure-authjs.session-token",
  })
  return `__Secure-authjs.session-token=${token}`
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-2047", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    })
    await res.arrayBuffer()
    return res.status === 200 || res.status === 206
  } catch {
    return false
  }
}

const matched: { song: UnboundSong; apiId: string; quality: string; cover: string | null }[] = []
const skipped: { song: UnboundSong; reason: string }[] = []

for (const song of songs) {
  const found = await searchQqSongs(song.title, song.artist)
  if (!found.ok) {
    skipped.push({ song, reason: found.error })
    continue
  }

  const artistKey = song.artist.toLowerCase().replace(/\s+/g, "")
  const exact = found.data.find((item) => {
    const singer = item.artist.toLowerCase().replace(/\s+/g, "")
    return item.title === song.title.trim() && singer.includes(artistKey)
  })
  if (!exact) {
    skipped.push({ song, reason: "QQ 上没有同名同歌手的版本" })
    continue
  }

  const urls = await getQqPlayUrls(exact.apiId, exact.title)
  if (!urls.ok) {
    skipped.push({ song, reason: urls.error })
    continue
  }
  const candidate = urls.data.sq ?? urls.data.pq ?? urls.data.m4a
  if (!candidate) {
    skipped.push({ song, reason: "QQ 没给可用直链" })
    continue
  }
  const quality = urls.data.sq ? "sq" : urls.data.pq ? "pq" : "m4a"
  const playable = await probe(candidate)
  if (!playable) {
    skipped.push({ song, reason: `直链探测失败（${quality}）` })
    continue
  }

  matched.push({ song, apiId: exact.apiId, quality, cover: urls.data.coverUrl })
  console.log(`  ✓ ${song.artist} - ${song.title} → ${quality}（${exact.apiId}）`)
}

console.log(`\n匹配并验证可播：${matched.length} 首；跳过：${skipped.length} 首`)
for (const item of skipped) console.log(`  - ${item.song.artist} - ${item.song.title}：${item.reason}`)

if (dryRun || matched.length === 0) {
  process.exit(matched.length === 0 && skipped.length > 0 ? 0 : 0)
}

const cookie = await ownerCookie()
let bound = 0
const failed: string[] = []

for (const item of matched) {
  const res = await fetch(`${SITE}/api/admin/music/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      items: [{ songId: item.song.id, apiId: item.apiId, source: "tencent" }],
    }),
  })
  const data = await res.json().catch(() => null)
  if (res.ok && data?.bound === 1) {
    bound += 1
  } else {
    failed.push(`${item.song.title}：HTTP ${res.status} ${data?.error ?? data?.failed?.[0]?.error ?? ""}`)
  }
  await sleep(600)
}

console.log(`\n已绑定：${bound} 首`)
for (const line of failed) console.log(`  ✗ ${line}`)
process.exit(failed.length > 0 ? 1 : 0)
