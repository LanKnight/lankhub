/**
 * P1 验收：多源播放解析（含故障注入）。
 *
 * 直接调用 src/lib/music-resolve.ts，不依赖本地数据库与服务端。
 *   npx tsx scripts/music-resolve-test.mts
 *
 * 用 MUSIC_DISABLED_PROVIDERS 模拟"某个源挂了"，验证回退是否真的生效。
 */

import { resolvePlayUrl, type ProviderName, type ResolvableSong } from "../src/lib/music-resolve"

const neteaseSongs: ResolvableSong[] = [
  { id: 153, title: "Counting Stars", artist: "OneRepublic", apiId: "26060065", source: "netease" },
  { id: 97, title: "大鱼", artist: "周深", apiId: "516823132", source: "netease" },
  { id: 177, title: "蜃楼", artist: "周深", apiId: "2140776001", source: "netease" },
]

// QQ 源：晴天 / 周杰伦 的 song_mid（实测值）
const tencentSong: ResolvableSong = {
  id: 999,
  title: "晴天",
  artist: "周杰伦",
  apiId: "0039MnYb0qxYhV",
  source: "tencent",
}

let pass = 0
const fail: string[] = []
const check = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail.push(name)
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`)
}

async function probe(url: string): Promise<{ ok: boolean; status: number; bytes: number }> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-2047", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: res.status === 200 || res.status === 206, status: res.status, bytes: buf.length }
  } catch (error) {
    return { ok: false, status: -1, bytes: 0 }
  }
}

async function runSong(song: ResolvableSong, label: string, expect?: ProviderName[]) {
  const started = Date.now()
  const result = await resolvePlayUrl(song, { force: true })
  const ms = Date.now() - started
  if (!result.ok) {
    check(`${label} 解析成功`, false, `${result.code}：${result.error}（${ms}ms）`)
    return
  }
  const { provider, quality, url } = result.data
  check(`${label} 解析成功`, true, `${provider}/${quality} ${ms}ms`)
  if (expect) check(`${label} 命中预期源`, expect.includes(provider), `实际 ${provider}`)
  check(`${label} 地址是 https 或同源`, url.startsWith("https://"), url.slice(0, 48))
  const p = await probe(url)
  check(`${label} 地址真的能取到音频`, p.ok && p.bytes > 0, `HTTP ${p.status} ${p.bytes}B`)
}

console.log("=== 1) 网易云歌曲（默认链：GD → Meting → QQ）===")
for (const song of neteaseSongs) {
  await runSong(song, `${song.title}`, ["gd", "meting", "tang"])
}

console.log("\n=== 2) QQ 源歌曲（应命中 QQ，且优先 SQ）===")
await runSong(tencentSong, "晴天（QQ源）", ["tang"])

console.log("\n=== 3) 故障注入：禁用 GD，网易云歌曲应自动回退 ===")
process.env.MUSIC_DISABLED_PROVIDERS = "gd"
// 需要重新 import 才能让模块读到新的环境变量（模块顶层已读过一次）
const fresh = await import(`../src/lib/music-resolve.ts?disabled=${Date.now()}`)
for (const song of neteaseSongs.slice(0, 2)) {
  const started = Date.now()
  const result = await fresh.resolvePlayUrl(song, { force: true })
  const ms = Date.now() - started
  if (!result.ok) {
    check(`回退：${song.title} 仍能播放`, false, `${result.code}：${result.error}（${ms}ms）`)
    continue
  }
  check(
    `回退：${song.title} 绕开 GD 仍能播放`,
    result.data.provider !== "gd",
    `${result.data.provider}/${result.data.quality} ${ms}ms`
  )
  const p = await probe(result.data.url)
  check(`回退：${song.title} 地址可用`, p.ok && p.bytes > 0, `HTTP ${p.status}`)
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) {
  fail.forEach((name) => console.log(`  ✗ ${name}`))
  process.exit(1)
}
