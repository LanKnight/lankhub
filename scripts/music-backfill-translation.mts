/**
 * 给存量歌曲补译文（lyricTrans）。
 *
 * 走后台的「刷新歌词」接口，而不是直接写数据库 —— 中文/emoji 走 shell 拼 SQL 很容易出错。
 *
 * 只处理**看起来是外语歌**的（歌词里中文字符占比低），因为中文歌的 tlyric 恒为空，
 * 全量跑只是白耗第三方配额。中文歌以后自然会在重绑时补上。
 *
 * 用法：npx tsx scripts/music-backfill-translation.mts [--limit 30] [--dry-run]
 */

import { execFileSync } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { encode } from "next-auth/jwt"

const KEY = `${process.env.USERPROFILE}\\.ssh\\lankhub-personal`
const SITE = "https://www.lankhub.xyz"
const ssh = (c: string) => execFileSync("ssh", ["-i", KEY, "-o", "StrictHostKeyChecking=no", "root@8.134.186.118", c], { encoding: "utf8" })

const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : 30

const secret = ssh("cd /root/lankhub && grep -h AUTH_SECRET .env.local | head -1 | cut -d= -f2-").trim().replace(/^["']|["']$/g, "")
const token = await encode({ token: { sub: "1", id: "1", role: "OWNER", permissions: null }, secret, salt: "__Secure-authjs.session-token" })
const cookie = `__Secure-authjs.session-token=${token}`

/** 用 base64 传歌词文本，避免分隔符/换行把一行拆坏 */
const rows = ssh(
  `cd /root/lankhub && sqlite3 -separator ' | ' dev.db "select id, title, artist, lyricId, ifnull(length(lyric),0) from Song where lyricId is not null order by id;"`
)
  .trim()
  .split("\n")
  .map((line) => {
    const [id, title, artist, lyricId, lyricLen] = line.split(" | ")
    return { id: Number(id), title, artist, lyricId, lyricLen: Number(lyricLen) }
  })

// 判断"是否外语歌"：从库里取歌词，算中日韩字符占比
function cjkRatio(text: string): number {
  if (text.length === 0) return 1
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  return cjk / text.length
}

const candidates: typeof rows = []
for (const row of rows) {
  // 只取一小段判断语言，避免读整库
  const sample = ssh(`cd /root/lankhub && sqlite3 dev.db "select substr(ifnull(lyric,''),1,600) from Song where id=${row.id};"`)
  const ratio = cjkRatio(sample)
  if (ratio < 0.5) candidates.push(row)
}

console.log(`有歌词 id 的歌：${rows.length} 首；看起来是外语歌：${candidates.length} 首；本次处理上限：${limit}`)
const targets = candidates.slice(0, limit)
if (dryRun) {
  for (const item of targets) console.log(`  - ${item.artist} - ${item.title}`)
  process.exit(0)
}

let updated = 0
let withTrans = 0
const problems: string[] = []

for (let i = 0; i < targets.length; i += 5) {
  const batch = targets.slice(i, i + 5)
  const res = await fetch(`${SITE}/api/admin/music/refresh-lyric`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ songIds: batch.map((item) => item.id) }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    problems.push(`批次 ${i}：HTTP ${res.status} ${data?.error ?? ""}`)
  } else {
    updated += data.updated ?? 0
    for (const skip of data.skipped ?? []) problems.push(`songId ${skip.songId}：${skip.reason}`)
    console.log(`  批次 ${i / 5 + 1}：更新 ${data.updated} 首`)
  }
  // 网易云配额 45 次 / 5 分钟：5 首一批，批间留 8 秒，稳妥不撞墙
  await sleep(8000)
}

// 统计有多少首真的拿到了译文
const transCount = ssh(`cd /root/lankhub && sqlite3 dev.db "select count(*) from Song where lyricTrans is not null and length(lyricTrans) > 0;"`).trim()
withTrans = Number(transCount)

console.log(`\n已刷新：${updated} 首；全库有译文的歌：${withTrans} 首`)
for (const line of problems.slice(0, 10)) console.log(`  ! ${line}`)
