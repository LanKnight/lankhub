/*
 * 验证 getClientIp 的 X-Forwarded-For 修复。
 *
 * 背景（真实漏洞）：原先取 XFF 的**第一个**值，而 Nginx 的
 * `$proxy_add_x_forwarded_for` 会保留客户端自带的值再追加真实 IP ——
 * 于是「第一个值」由客户端控制，所有基于 IP 的限流都能被一个请求头绕过。
 *
 * 这个测试锁死修复后的行为，防止以后有人"顺手简化"回取最左。
 *
 * 用法：npx tsx scripts/xff-ip-test.mts
 */
import { getClientIp } from "../src/lib/rate-limit"

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

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

console.log("\n【1】★ 伪造的 XFF 前缀必须被忽略")
{
  /*
   * 这是漏洞的核心场景：攻击者自带 `1.2.3.4`，Nginx 在后面追加真实 IP。
   * 修复后必须取到**真实 IP**（最后一段），而不是伪造的那段。
   */
  const ip = getClientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))
  check("取最右（真实 IP）而不是最左（伪造值）", ip === "203.0.113.9", ip)

  const ip2 = getClientIp(
    headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.9" })
  )
  check("多段伪造时仍取最右", ip2 === "203.0.113.9", ip2)

  // 对比：如果按漏洞写法取最左，上面两条会得到 1.2.3.4 / 9.9.9.9
  const naive = "1.2.3.4, 203.0.113.9".split(",")[0].trim()
  check("对照：取最左会得到伪造值（说明修复有意义）", naive === "1.2.3.4", naive)
}

console.log("\n【2】只有一段 XFF（Nginx 覆盖写法）时正常工作")
{
  const ip = getClientIp(headers({ "x-forwarded-for": "203.0.113.9" }))
  check("单段直接采用", ip === "203.0.113.9", ip)
}

console.log("\n【3】XFF 缺失时退回 X-Real-IP")
{
  const ip = getClientIp(headers({ "x-real-ip": "203.0.113.7" }))
  check("用 X-Real-IP", ip === "203.0.113.7", ip)
}

console.log("\n【4】XFF 形状非法时退回 X-Real-IP（而不是用垃圾值）")
{
  const ip = getClientIp(
    headers({ "x-forwarded-for": "not-an-ip", "x-real-ip": "203.0.113.5" })
  )
  check("非法 XFF 被丢弃，改用 X-Real-IP", ip === "203.0.113.5", ip)
}

console.log("\n【5】两个头都没有时退回 127.0.0.1（宁可用粗粒度桶也不放行）")
{
  const ip = getClientIp(headers({}))
  check("返回默认值", ip === "127.0.0.1", ip)
}

console.log("\n【6】IPv6 与带端口的形式")
{
  check("IPv6 原样返回", getClientIp(headers({ "x-forwarded-for": "2001:db8::1" })) === "2001:db8::1")
  check(
    "带方括号的 IPv6",
    getClientIp(headers({ "x-forwarded-for": "[2001:db8::1]:443" })) === "[2001:db8::1]:443"
  )
  check("IPv4 带端口", getClientIp(headers({ "x-forwarded-for": "203.0.113.9:1234" })) === "203.0.113.9:1234")
}

console.log("\n【7】极端长度与空白")
{
  check("超长值被丢弃", getClientIp(headers({ "x-forwarded-for": "a".repeat(200) })) === "127.0.0.1")
  check(
    "带空格的段被 trim",
    getClientIp(headers({ "x-forwarded-for": "  1.2.3.4 ,  203.0.113.9  " })) === "203.0.113.9"
  )
  check("空段不会变成有效 IP", getClientIp(headers({ "x-forwarded-for": ",," })) === "127.0.0.1")
}

console.log("\n【8】限流键隔离（最实际的效果）")
{
  // 同一真实 IP 的两个请求应落到同一个桶；伪造不同前缀不应改变桶
  const a = getClientIp(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))
  const b = getClientIp(headers({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" }))
  check("★ 伪造不同前缀仍是同一个 IP（→ 同一个限流桶）", a === b, `${a} vs ${b}`)

  const c = getClientIp(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))
  const d = getClientIp(headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.1" }))
  check("真实 IP 不同则桶不同", c !== d, `${c} vs ${d}`)
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  fail.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
