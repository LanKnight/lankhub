/*
 * 验证「上游响应形状校验」。
 *
 * 要防的是这类问题：第三方改了返回字段 → 应用把它当成「这首歌没版权」，
 * 于是用户看到「突然没版权的歌」、排查时完全想不到是上游协议变了。
 *
 * 关键区分：
 *   { "url": "" }      → 该音源真的没有这首歌（永久失败，换歌）
 *   {} / 非对象 / 缺字段 → **上游协议变了**（暂时性失败，值得重试并报"上游异常"）
 *
 * 用 mock 替换 globalThis.fetch，构造各种畸形返回。
 *
 * 用法：npx tsx scripts/upstream-shape-test.mts
 */
import { getPlayUrl, getCoverUrl, getLyric } from "../src/lib/music-api"

let pass = 0
const fail: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

const realFetch = globalThis.fetch

/**
 * 让下一次（或接下来几次）上游返回指定的 JSON。
 *
 * 注意 music-api 里有 45 次/5 分钟的自我配额闸门，每调一次都会占额度 ——
 * 本测试只调十几次，远低于上限；但为了让多次运行不累积，这里不改那个计数器
 * （它按真实时间滚动，5 分钟后自然释放）。
 */
function mockJson(body: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch
}

function restore(): void {
  globalThis.fetch = realFetch
}

/** 每条断言用一个唯一 apiId，避免命中 playUrlCache / 影响其他用例 */
let seq = 0
const nextId = () => `shape-test-${Date.now()}-${seq++}`

try {
  console.log("\n【1】正常形态：应返回地址")
  {
    mockJson({ url: "https://example.test/a.mp3" })
    const r = await getPlayUrl(nextId())
    check("拿到地址", r.ok && r.data.startsWith("https://"), r.ok ? r.data : r.error)
    restore()
  }

  console.log("\n【2】★ 空字符串地址 → 永久失败（该音源没有这首）")
  {
    // 实测 kuwo / joox 就是这形态
    mockJson({ url: "", br: -1 })
    const r = await getPlayUrl(nextId())
    check("判为失败", !r.ok)
    check("★ code = url_unavailable（永久，前端换歌）", !r.ok && r.code === "url_unavailable", !r.ok ? String(r.code) : "")
    restore()
  }

  console.log("\n【3】★★ 字段缺失 → 上游协议变了，归为 upstream_error")
  {
    // 这一条是本轮修的重点：以前会被误判成「没版权」
    mockJson({ br: 320 })
    const r = await getPlayUrl(nextId())
    check("判为失败", !r.ok)
    check("★ code = upstream_error（暂时，值得重试）", !r.ok && r.code === "upstream_error", !r.ok ? String(r.code) : "")
    check(
      "★ 文案点明是上游数据问题，不是「没版权」",
      !r.ok && /没有播放地址字段|预料之外/.test(r.error),
      !r.ok ? r.error : ""
    )
    restore()
  }

  console.log("\n【4】返回数组（形状完全不对）")
  {
    mockJson([{ url: "https://example.test/a.mp3" }])
    const r = await getPlayUrl(nextId())
    check("数组被判为失败", !r.ok)
    check("code = upstream_error", !r.ok && r.code === "upstream_error", !r.ok ? String(r.code) : "")
    restore()
  }

  console.log("\n【5】返回 null")
  {
    mockJson(null)
    const r = await getPlayUrl(nextId())
    check("null 被判为失败", !r.ok)
    check("code = upstream_error", !r.ok && r.code === "upstream_error", !r.ok ? String(r.code) : "")
    restore()
  }

  console.log("\n【6】url 字段类型不对（数字）")
  {
    mockJson({ url: 12345 })
    const r = await getPlayUrl(nextId())
    check("类型不对被判为失败", !r.ok)
    /*
     * 字段**存在**但类型不对：既不是「空地址」也不是「缺字段」。
     * 归为 url_unavailable（当作没有可用地址）也是合理的 ——
     * 但绝不能返回一个数字当地址用。
     */
    check("没有把非法值当地址返回", !r.ok, !r.ok ? String(r.code) : String(r.data))
    restore()
  }

  console.log("\n【7】上游 5xx → upstream_error")
  {
    mockJson({ message: "boom" }, 503)
    const r = await getPlayUrl(nextId())
    check("5xx 被判为失败", !r.ok)
    check("code = upstream_error", !r.ok && r.code === "upstream_error", !r.ok ? String(r.code) : "")
    restore()
  }

  console.log("\n【8】封面与歌词同样有形状校验")
  {
    mockJson({ notUrl: 1 })
    const cover = await getCoverUrl(nextId())
    check("封面缺 url 字段 → upstream_error", !cover.ok && cover.code === "upstream_error", !cover.ok ? String(cover.code) : "")

    mockJson({ notLyric: 1 })
    const lyric = await getLyric(nextId())
    check("歌词缺 lyric 字段 → upstream_error", !lyric.ok && lyric.code === "upstream_error", !lyric.ok ? String(lyric.code) : "")

    mockJson({ url: "https://example.test/c.jpg" })
    const cover2 = await getCoverUrl(nextId())
    check("封面正常形态仍可用", cover2.ok, cover2.ok ? cover2.data : cover2.error)
    restore()
  }
} catch (e) {
  console.error("\n测试出错：", e)
  fail.push(`脚本异常：${(e as Error).message}`)
} finally {
  restore()
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  fail.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
