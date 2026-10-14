/**
 * 阶段 4 验证：验证码核心逻辑（src/lib/email/verify-code.ts）。
 *
 * 用法（需要一个已 db push 的库）：
 *   npx tsx scripts/verify-code-test.mts
 *
 * 为了让测试快、可重复、**不消耗 Resend 免费额度**（100 封/天），
 * 本脚本会：
 *   1. 起一个本地 mock HTTP 服务冒充 Resend
 *   2. 把 RESEND_API_BASE 指向它
 *   3. 直接从 mock 收到的请求体里**读出验证码**（因为库里存的是哈希，读不出来）
 *   4. 跑完全部场景后把测试数据删干净、并核对库里没留下东西
 *
 * 覆盖的安全约束（对应 docs/emailAuthDevDoc.md 第六节）：
 *   冷却 / 单邮箱日限 / 单 IP 日限 / 全站日限 / 全站月限
 *   有效期 / 用后即焚 / 错误次数上限 / 场景隔离 / 邮箱规范化 / 并发重放
 */
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createServer, type Server } from "node:http"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })

// ---- mock Resend：收到请求即记录 body，并回一个成功响应 ----
const sent: { to: string; subject: string; code: string }[] = []
let mockFailStatus: number | null = null

const mock: Server = createServer((req, res) => {
  let raw = ""
  req.on("data", (c) => (raw += c))
  req.on("end", () => {
    if (mockFailStatus !== null) {
      res.writeHead(mockFailStatus, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ message: "mock failure" }))
      return
    }
    try {
      const body = JSON.parse(raw) as { to: string[]; subject: string; html: string }
      const m = body.html.match(/letter-spacing:8px[^>]*>(\d{6})</)
      sent.push({ to: body.to[0], subject: body.subject, code: m ? m[1] : "" })
    } catch {
      /* 忽略解析失败，后面的断言会体现出来 */
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ id: `mock-${sent.length}` }))
  })
})

const PORT = 45999
await new Promise<void>((r) => mock.listen(PORT, "127.0.0.1", r))
process.env.RESEND_API_BASE = `http://127.0.0.1:${PORT}`
// 必须有一个 Key，否则 sender 会在发信前就拒绝
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_mock_for_test_only_000"

const { prisma } = await import("../src/lib/prisma")
const {
  sendCode,
  verifyCode,
  describeFail,
  statusForFail,
  COOLDOWN_SECONDS,
  MAX_ATTEMPTS,
  PER_EMAIL_DAILY_MAX,
  GLOBAL_DAILY_MAX,
} = await import("../src/lib/email/verify-code")

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

const TEST_EMAIL = "codetest@test.local"
const TEST_IP = "10.99.99.99"
const codeCount = () => prisma.emailCode.count()
const lastCode = () => sent[sent.length - 1]?.code ?? ""

async function cleanup() {
  /*
   * ⚠️ 清理必须覆盖本测试用到的**全部**邮箱与 IP，而不只是主测试邮箱。
   *
   * 为什么关键：全站日限与月限是**按全表统计**的，任何残留都会把
   * 「刚好差 1 条时仍可发」那条断言挤爆 ——
   * 实测踩到：另一个脚本留下 7 条记录，就让那条断言误报失败，
   * 而失败信息看起来像「配额逻辑坏了」，其实只是脏数据。
   *
   * 所以这里把各处合成数据用到的邮箱与假 IP 也一并清掉：
   *   - 第 8 节按 IP 造 30 条（10.1.1.1）
   *   - 第 9 节按全站造 79 条（bulk*@test.local / 10.2.2.2 等）
   */
  await prisma.emailCode.deleteMany({
    where: {
      OR: [
        { email: TEST_EMAIL },
        { ip: TEST_IP },
        { ip: "10.1.1.1" },
        { ip: "10.2.2.2" },
        { ip: "10.3.3.3" },
        { ip: "10.4.4.4" },
        { email: { startsWith: "bulk" } },
        { email: { contains: "test.local" } },
      ],
    },
  })
}

try {
  await cleanup()
  const baseline = await codeCount()

  console.log("\n【1】正常发码与校验")
  {
    const r = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("发码成功", r.ok, r.ok ? "" : describeFail(r.reason))
    check("真的调用了邮件服务（mock 收到 1 封）", sent.length === 1, `共 ${sent.length} 封`)
    check("收件人正确", sent[0]?.to === TEST_EMAIL, sent[0]?.to)
    check("主题按场景区分", sent[0]?.subject.includes("登录验证码"), sent[0]?.subject)
    const code = lastCode()
    check("从邮件里解析出 6 位验证码", /^\d{6}$/.test(code), `code=${code}`)

    const rec = await prisma.emailCode.findFirst({ where: { email: TEST_EMAIL } })
    check("库里存的是哈希而非明文", rec !== null && rec.codeHash !== code, `hash 长度 ${rec?.codeHash.length}`)
    check("哈希是 64 位 hex（SHA-256）", /^[0-9a-f]{64}$/.test(rec?.codeHash ?? ""))
    check("库里查不到明文验证码", !JSON.stringify(rec).includes(code))
    check("记录了请求 IP", rec?.ip === TEST_IP, rec?.ip ?? "null")

    // 正确验证码
    const v = await verifyCode({ email: TEST_EMAIL, scene: "login", code })
    check("正确验证码通过", v.ok, v.ok ? "" : describeFail(v.reason))
    const after = await prisma.emailCode.findFirst({ where: { email: TEST_EMAIL } })
    check("★ 用后即焚：consumedAt 已写入", after?.consumedAt !== null && after?.consumedAt !== undefined)
  }

  console.log("\n【2】用后即焚（重放防护）")
  {
    const v = await verifyCode({ email: TEST_EMAIL, scene: "login", code: lastCode() })
    check("同一码再用一次被拒", !v.ok && v.reason === "used", v.ok ? "竟然通过了" : v.reason)
    check("对外文案不泄露「已用过」", describeFail("used") === "验证码错误或已失效，请重新获取", describeFail("used"))
  }

  console.log("\n【3】场景隔离")
  {
    await cleanup()
    // 用 login 场景发码，拿去 register 场景校验
    await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    const code = lastCode()
    // 冷却会挡住同场景重发，所以直接用另一个场景
    const v = await verifyCode({ email: TEST_EMAIL, scene: "register", code })
    check("login 的码不能用于 register", !v.ok, v.ok ? "竟然通过了" : v.reason)
  }

  console.log("\n【4】错误次数上限")
  {
    await cleanup()
    await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    const code = lastCode()
    const wrong = code === "000000" ? "111111" : "000000"

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const v = await verifyCode({ email: TEST_EMAIL, scene: "login", code: wrong })
      const expectedLast = i >= MAX_ATTEMPTS
      check(
        `第 ${i} 次错误码被拒${expectedLast ? "（并作废）" : ""}`,
        !v.ok && (expectedLast ? v.reason === "too-many-attempts" : v.reason === "mismatch"),
        v.ok ? "竟然通过了" : v.reason
      )
    }
    const rec = await prisma.emailCode.findFirst({ where: { email: TEST_EMAIL } })
    check("attempts 累加到上限", rec?.attempts === MAX_ATTEMPTS, String(rec?.attempts))
    check("★ 达到上限后记录被强制作废（consumedAt 已写）", rec?.consumedAt !== null && rec?.consumedAt !== undefined)

    // 关键：此时即使输对也不能过
    const v = await verifyCode({ email: TEST_EMAIL, scene: "login", code })
    check("★ 作废后即使输对也无法通过", !v.ok, v.ok ? "竟然通过了" : v.reason)
  }

  console.log("\n【5】有效期")
  {
    await cleanup()
    await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    const code = lastCode()
    // 手工把过期时间改到过去
    await prisma.emailCode.updateMany({
      where: { email: TEST_EMAIL },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const v = await verifyCode({ email: TEST_EMAIL, scene: "login", code })
    check("过期码被拒", !v.ok && v.reason === "expired", v.ok ? "竟然通过了" : v.reason)
    check("对外文案与「错误」一致（不泄露已过期）", describeFail("expired") === describeFail("mismatch"))
  }

  console.log("\n【6】冷却")
  {
    await cleanup()
    // ⚠️ mock 的 sent 是**跨小节累积**的，所以要记增量而不是比总数。
    // 第一版写成 sent.length === 1，结果在第 6 节时已经累积了 4 封，假失败。
    const before = sent.length
    const r1 = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("第一次发码成功", r1.ok)
    const afterFirst = sent.length
    check("第一次确实发了 1 封", afterFirst - before === 1, `增量 ${afterFirst - before}`)

    const r2 = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("60 秒内重复发码被拒", !r2.ok && r2.reason === "cooldown", r2.ok ? "竟然通过了" : r2.reason)
    check(
      "返回了剩余秒数",
      !r2.ok && typeof r2.retryAfterSeconds === "number" && r2.retryAfterSeconds > 0 && r2.retryAfterSeconds <= COOLDOWN_SECONDS,
      !r2.ok ? `${r2.retryAfterSeconds}s` : ""
    )
    check("★ 冷却期间没有真的发第二封邮件（不消耗 Resend 额度）", sent.length === afterFirst, `增量 ${sent.length - afterFirst}`)
    check("冷却被拒时不写库（不占配额）", (await prisma.emailCode.count({ where: { email: TEST_EMAIL } })) === 1)
  }

  console.log("\n【7】单邮箱日限")
  {
    await cleanup()
    // 绕过冷却：直接造 10 条记录，且把最后一条的 createdAt 设成过去
    const rows = Array.from({ length: PER_EMAIL_DAILY_MAX }, (_, i) => ({
      email: TEST_EMAIL,
      scene: "login" as const,
      codeHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 600000),
      ip: TEST_IP,
      // 全部设在 2 小时前，避开冷却
      createdAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
    }))
    await prisma.emailCode.createMany({ data: rows })
    const r = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check(`已达 ${PER_EMAIL_DAILY_MAX} 封/天时被拒`, !r.ok && r.reason === "quota-email", r.ok ? "竟然通过了" : r.reason)
    check("状态码为 429", statusForFail("quota-email") === 429)
  }

  console.log("\n【8】单 IP 日限")
  {
    await cleanup()
    // 同一 IP、不同邮箱：验证 IP 维度独立于邮箱维度
    const rows = Array.from({ length: 30 }, (_, i) => ({
      email: `other${i}@test.local`,
      scene: "login" as const,
      codeHash: "y".repeat(64),
      expiresAt: new Date(Date.now() + 600000),
      ip: TEST_IP,
      createdAt: new Date(Date.now() - (i + 1) * 60 * 1000),
    }))
    await prisma.emailCode.createMany({ data: rows })
    const r = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("同一 IP 达 30 封/天时被拒", !r.ok && r.reason === "quota-ip", r.ok ? "竟然通过了" : r.reason)
    check("换一个 IP 就放行（该维度按 IP 独立计数）", (await sendCode({ email: TEST_EMAIL, scene: "login", ip: "10.1.1.1" })).ok)
  }

  console.log("\n【9】全站日限与月限")
  {
    await cleanup()
    // 造到离日限只差 1 条
    const need = GLOBAL_DAILY_MAX - 1
    const rows = Array.from({ length: need }, (_, i) => ({
      email: `bulk${i}@test.local`,
      scene: "login" as const,
      codeHash: "z".repeat(64),
      expiresAt: new Date(Date.now() + 600000),
      ip: "10.2.2.2",
      createdAt: new Date(Date.now() - (i + 1) * 1000),
    }))
    await prisma.emailCode.createMany({ data: rows })
    const r1 = await sendCode({ email: TEST_EMAIL, scene: "login", ip: "10.3.3.3" })
    check("未达全站日限时仍可发", r1.ok, r1.ok ? "" : describeFail(r1.reason))
    const r2 = await sendCode({ email: "another@test.local", scene: "login", ip: "10.4.4.4" })
    check(`★ 达全站日限（${GLOBAL_DAILY_MAX}）后被拒`, !r2.ok && r2.reason === "quota-global-daily", r2.ok ? "竟然通过了" : r2.reason)
    check("文案明确说明是「站点上限」而非笼统失败", describeFail("quota-global-daily").includes("站点上限"), describeFail("quota-global-daily"))
    check("月限有单独文案", describeFail("quota-global-monthly").includes("本月"), describeFail("quota-global-monthly"))
  }

  console.log("\n【10】邮箱规范化")
  {
    await cleanup()
    const r = await sendCode({ email: "  CodeTest@Test.Local  ", scene: "login", ip: TEST_IP })
    check("带空格与大写的邮箱能发码", r.ok, r.ok ? "" : describeFail(r.reason))
    const rec = await prisma.emailCode.findFirst({ where: { email: TEST_EMAIL } })
    check("库里存的是规范化后的小写邮箱", rec !== null, rec?.email ?? "没有记录")
    const v = await verifyCode({ email: "CODETEST@TEST.LOCAL", scene: "login", code: lastCode() })
    check("用大写邮箱也能校验通过", v.ok, v.ok ? "" : describeFail(v.reason))
  }

  console.log("\n【11】输入形状与不存在的记录")
  {
    const v1 = await verifyCode({ email: TEST_EMAIL, scene: "login", code: "abcdef" })
    check("非数字验证码直接拒（不做 HMAC）", !v1.ok && v1.reason === "mismatch")
    const v2 = await verifyCode({ email: TEST_EMAIL, scene: "login", code: "12345" })
    check("位数不足直接拒", !v2.ok)
    const v3 = await verifyCode({ email: "nobody@test.local", scene: "login", code: "123456" })
    check("没有记录的邮箱被拒", !v3.ok && v3.reason === "mismatch")
    check("「没有记录」与「码错误」对外文案一致", describeFail("mismatch") === describeFail("expired"))
  }

  console.log("\n【12】发信失败时的处理")
  {
    await cleanup()
    mockFailStatus = 401
    const r = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    mockFailStatus = null
    check("发信失败被如实上报", !r.ok && r.reason === "send-failed", r.ok ? "竟然成功了" : `${r.reason}`)
    check("失败原因里带了具体错误（便于排查 Key 问题）", !r.ok && /鉴权|Key|失败/.test(String(r.detail)), String(!r.ok ? r.detail : ""))
    check(
      "★ 发信失败时把刚写的记录删掉了（否则用户会卡在冷却里且白占配额）",
      (await prisma.emailCode.count({ where: { email: TEST_EMAIL } })) === 0,
      `剩 ${await prisma.emailCode.count({ where: { email: TEST_EMAIL } })} 条`
    )
    const r2 = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("发信失败后可以立刻重试（没有被冷却挡住）", r2.ok, r2.ok ? "" : describeFail(r2.reason))
  }

  console.log("\n【13】并发重放")
  {
    await cleanup()
    await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    const code = lastCode()
    // 同时发 5 个校验请求，只应有 1 个成功
    const results = await Promise.all(
      Array.from({ length: 5 }, () => verifyCode({ email: TEST_EMAIL, scene: "login", code }))
    )
    const okCount = results.filter((r) => r.ok).length
    check("★ 5 个并发请求只有 1 个成功（原子消费生效）", okCount === 1, `成功 ${okCount} 个`)
    const restReasons = results.filter((r) => !r.ok).map((r) => (!r.ok ? r.reason : ""))
    check("其余都因「已使用」被拒", restReasons.every((x) => x === "used"), restReasons.join(", "))
  }

  console.log("\n【14】配置缺失与开关")
  {
    const realBase = process.env.RESEND_API_BASE
    const realKey = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
    await cleanup()
    const r = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("缺 RESEND_API_KEY 时报 send-failed 且原因具体", !r.ok && r.reason === "send-failed", !r.ok ? String(r.detail) : "")
    check("错误文案点明「未配置」而不是笼统失败", !r.ok && String(r.detail).includes("未配置"), String(!r.ok ? r.detail : ""))
    process.env.RESEND_API_KEY = realKey

    process.env.EMAIL_ENABLED = "false"
    const r2 = await sendCode({ email: TEST_EMAIL, scene: "login", ip: TEST_IP })
    check("EMAIL_ENABLED=false 时拒绝发码", !r2.ok && r2.reason === "email-disabled", r2.ok ? "竟然成功了" : r2.reason)
    check("文案提示改用密码登录（保留密码登录的价值）", describeFail("email-disabled").includes("密码登录"))
    const r3 = await verifyCode({ email: TEST_EMAIL, scene: "login", code: "123456" })
    check("关闭时也拒绝校验", !r3.ok && r3.reason === "email-disabled")
    delete process.env.EMAIL_ENABLED
    process.env.RESEND_API_BASE = realBase
  }

  console.log("\n【15】清理与还原")
  {
    await cleanup()
    const after = await codeCount()
    check("测试数据已清干净", after === baseline, `测试前 ${baseline} 条，现在 ${after} 条`)
  }
} catch (error) {
  console.error("\n验证出错：", error)
  fail.push(`脚本异常：${error instanceof Error ? error.message : String(error)}`)
} finally {
  await cleanup()
  await prisma.$disconnect()
  mock.close()
  console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
  if (fail.length > 0) {
    for (const f of fail) console.log(`  - ${f}`)
    process.exitCode = 1
  }
}
