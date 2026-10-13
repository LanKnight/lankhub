import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/sender"
import { CODE_TTL_MINUTES, renderCodeEmail } from "@/lib/email/templates"
import { getSiteName, isEmailEnabled } from "@/lib/email/sender"

/**
 * 邮箱验证码的**唯一入口**：生成 / 发送 / 校验 / 消费。
 *
 * 四个场景（注册 / 验证码登录 / 重置密码 / 改密码）都走这里，
 * 差别只在 scene 与是否要求邮箱已注册 —— 交给调用方判断。
 *
 * 为什么集中在一个模块：
 * 验证码的安全约束有**十几条**（限流三级、有效期、用后即焚、错误次数上限、
 * 时间安全比对、日志脱敏……）。分散到四个接口里各写一遍，必然有某处漏掉一条，
 * 而且漏掉的那条从功能上看不出来 —— 正是最危险的情况。
 */

/** 验证码用途。改这里时 templates.ts 的 SCENE_COPY 必须同步 */
export type EmailScene = "register" | "login" | "reset" | "change"

export const EMAIL_SCENES: readonly EmailScene[] = ["register", "login", "reset", "change"]

/** 是否是我们认识的场景（接口入口先用它挡一层，避免脏值写进库） */
export function isEmailScene(v: unknown): v is EmailScene {
  return typeof v === "string" && (EMAIL_SCENES as readonly string[]).includes(v)
}

// ============================================================
// 限流与配额（全部按「已落库的记录」统计，不用内存计数器）
//
// 为什么不用 src/lib/rate-limit.ts 的内存滑动窗口：
// 1) 全站配额是**跨重启必须保持**的 —— 内存计数在 pm2 restart 后归零，
//    攻击者只要等到重启就能继续刷，等于配额形同虚设
// 2) EmailCode 表本来就要写，顺手按 createdAt 统计即可，不额外增加存储
// 内存限流仍然适合登录接口（目的是挡住短时间的暴力尝试），两者用途不同。
// ============================================================

/** 同一邮箱同一场景的发码冷却（秒） */
export const COOLDOWN_SECONDS = 60
/** 同一邮箱 24 小时内的发码上限 */
export const PER_EMAIL_DAILY_MAX = 10
/** 同一 IP 24 小时内的发码上限 */
export const PER_IP_DAILY_MAX = 30
/** 全站 24 小时内的发码上限。Resend 免费额度是 100 封/天，留 20 封余量 */
export const GLOBAL_DAILY_MAX = 80
/** 全站 30 天内的发码上限。Resend 免费额度是 3000 封/月，留 500 封余量 */
export const GLOBAL_MONTHLY_MAX = 2500
/** 同一条验证码最多允许比对失败几次，超过即作废 */
export const MAX_ATTEMPTS = 5

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS

/** 失败原因。调用方据此决定 HTTP 状态码与用户文案 */
export type FailReason =
  | "email-disabled"
  | "not-configured"
  | "cooldown"
  | "quota-email"
  | "quota-ip"
  | "quota-global-daily"
  | "quota-global-monthly"
  | "expired"
  | "used"
  | "too-many-attempts"
  | "mismatch"
  | "send-failed"

export type SendResult =
  | { ok: true }
  | { ok: false; reason: FailReason; retryAfterSeconds?: number; detail?: string }

export type VerifyResult = { ok: true } | { ok: false; reason: FailReason; detail?: string }

// ============================================================
// 哈希与比对
// ============================================================

/**
 * 生成验证码。
 *
 * 用 crypto.randomInt 而不是 Math.random：后者是可预测的伪随机，
 * 攻击者拿到几个历史验证码就有可能推出后续的。
 */
function generateCode(): string {
  // 0..999999，补零到 6 位
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/**
 * 计算验证码的 HMAC 哈希。
 *
 * 为什么用 HMAC 而不是 bcrypt：
 * 6 位数字只有 100 万种，真正的防线是「错误次数上限」而不是哈希强度；
 * HMAC 让「6 位码 → 库里的值」不可逆就足够了，且不必为每次比对付
 * bcrypt 约 100ms 的开销。
 *
 * 为什么把 email 与 scene 也掺进盐里：
 * 同一个验证码在不同邮箱/场景下哈希不同，避免跨记录做彩虹表式比对；
 * 也防止「A 场景的码被拿去 B 场景用」这种越场景重放。
 *
 * AUTH_SECRET 缺失时抛异常而不是退化成固定盐：
 * 用固定盐等于没有盐，而且会让「部署时漏配 AUTH_SECRET」这种问题
 * 一直隐性存在 —— 宁可启动就报错。
 */
function hashCode(email: string, scene: EmailScene, code: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET 未配置，无法计算验证码哈希")
  }
  return createHmac("sha256", secret).update(`${email}:${scene}:${code}`).digest("hex")
}

/** 时间安全比较两个 hex 哈希，避免计时侧信道泄露「前几位猜对了」 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  } catch {
    return false
  }
}

// ============================================================
// 发送
// ============================================================

export type SendCodeParams = {
  email: string
  scene: EmailScene
  /** 客户端 IP，用于单 IP 配额。拿不到时传 null（该维度不计数） */
  ip: string | null
  /**
   * 跳过 60 秒冷却。**仅非生产环境生效**。
   *
   * 为什么需要它：端到端测试经常要对**同一个邮箱**连续触发几次发码
   * （例如「注册 → 没验证 → 再注册」，或验证「覆盖未验证账号」这条路径），
   * 而冷却会把这些调用挡掉，让断言看起来像功能坏了。
   *
   * 安全性：生产环境下这个参数被**忽略**（见下面的实现），
   * 所以即使客户端伪造它也无法绕过冷却。
   */
  skipCooldown?: boolean
}

/**
 * 发码前的各项检查。**只读，不写库**。
 *
 * 单独拆出来是为了让「该不该发」与「真的发出去」分开：
 * 检查不通过时不该留下任何记录（否则攻击者可以用失败的请求刷满表）。
 */
async function checkSendAllowed(
  email: string,
  scene: EmailScene,
  ip: string | null,
  skipCooldown: boolean
): Promise<SendResult> {
  const now = Date.now()

  // ① 冷却：同一邮箱同一场景 60 秒内只能发一次
  //
  // ⚠️ skipCooldown 只在**非生产环境**被承认。
  // 写成 `process.env.NODE_ENV !== "production" && skipCooldown` 而不是
  // 直接信任调用方传的值 —— 否则只要有人把这个参数接到请求体上，
  // 就等于把冷却关掉了。
  const cooldownDisabled = skipCooldown && process.env.NODE_ENV !== "production"
  if (!cooldownDisabled) {
    const last = await prisma.emailCode.findFirst({
      where: { email, scene },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    if (last) {
      const elapsed = now - last.createdAt.getTime()
      if (elapsed < COOLDOWN_SECONDS * 1000) {
        return {
          ok: false,
          reason: "cooldown",
          retryAfterSeconds: Math.ceil((COOLDOWN_SECONDS * 1000 - elapsed) / 1000),
        }
      }
    }
  }

  // ② 单邮箱日限
  const emailCount = await prisma.emailCode.count({
    where: { email, createdAt: { gte: new Date(now - DAY_MS) } },
  })
  if (emailCount >= PER_EMAIL_DAILY_MAX) {
    return { ok: false, reason: "quota-email" }
  }

  // ③ 单 IP 日限（IP 拿不到时跳过这一维度，而不是当成同一个 IP 计数）
  if (ip) {
    const ipCount = await prisma.emailCode.count({
      where: { ip, createdAt: { gte: new Date(now - DAY_MS) } },
    })
    if (ipCount >= PER_IP_DAILY_MAX) {
      return { ok: false, reason: "quota-ip" }
    }
  }

  // ④ 全站日限与月限
  //
  // 这两条是**保护 Resend 额度**的最后一道闸。没有它，攻击者可以换邮箱、
  // 换 IP 继续刷，把 100 封/天的免费额度烧光 —— 之后连站长自己都发不出验证码，
  // 而密码登录虽然还能用，重置密码等功能会全部失效。
  const dailyCount = await prisma.emailCode.count({
    where: { createdAt: { gte: new Date(now - DAY_MS) } },
  })
  if (dailyCount >= GLOBAL_DAILY_MAX) {
    return { ok: false, reason: "quota-global-daily" }
  }

  const monthlyCount = await prisma.emailCode.count({
    where: { createdAt: { gte: new Date(now - MONTH_MS) } },
  })
  if (monthlyCount >= GLOBAL_MONTHLY_MAX) {
    return { ok: false, reason: "quota-global-monthly" }
  }

  return { ok: true }
}

/**
 * 生成并存一条验证码，然后发信。
 *
 * ⚠️ 先写库再发信，而不是发信成功后再写库：
 * 若顺序相反、且发信后写库失败，用户会收到一封**永远无法通过**的验证码，
 * 那是比「发信失败」更难排查的状态。先写库最坏只是留下一条没人用的记录
 * （会被清理任务删掉），对用户表现为「没收到邮件」，可以重试。
 */
export async function sendCode(params: SendCodeParams): Promise<SendResult> {
  const email = params.email.trim().toLowerCase()
  const { scene, ip } = params

  if (!isEmailEnabled()) {
    return { ok: false, reason: "email-disabled" }
  }

  const allowed = await checkSendAllowed(email, scene, ip, params.skipCooldown === true)
  if (!allowed.ok) return allowed

  const code = generateCode()
  const codeHash = hashCode(email, scene, code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)

  await prisma.emailCode.create({
    data: { email, scene, codeHash, expiresAt, ip },
  })

  const { subject, html, text } = renderCodeEmail({ scene, code, siteName: getSiteName() })
  const sent = await sendEmail({ to: email, subject, html, text })

  if (!sent.ok) {
    /*
     * 发信失败时把刚写的记录删掉。
     *
     * 理由：留着它会让用户**卡在冷却里**（60 秒内不能重发）却什么都没收到；
     * 而且它还会占掉一次配额。删掉之后用户马上可以重试。
     * 注意这只删「我们刚插入的这一条」，不会误删别人的。
     */
    await prisma.emailCode
      .deleteMany({ where: { email, scene, codeHash, consumedAt: null } })
      .catch(() => undefined)
    return { ok: false, reason: "send-failed", detail: sent.error }
  }

  /*
   * 开发环境才打印验证码明文。
   * 生产环境绝不打印 —— 日志会被收集、转发、长期留存，
   * 一句 console.log 就等于把验证码写进了另一个数据库。
   */
  if (process.env.NODE_ENV !== "production") {
    console.log(`[email-code] 开发环境验证码 ${email} / ${scene} → ${code}`)
  }

  return { ok: true }
}

// ============================================================
// 校验与消费
// ============================================================

export type VerifyCodeParams = {
  email: string
  scene: EmailScene
  code: string
  /**
   * 校验通过后是否把该记录标记为已消费（用后即焚）。
   * 默认 true —— 只有极少数场景才需要关掉它，例如「一次验证通过后连续做两件事」。
   */
  consume?: boolean
}

/**
 * 校验验证码。通过时（默认）把它标记为已消费。
 *
 * 所有失败都统一收敛成 `mismatch` 之外的几个明确原因，
 * 但**对外文案要一致**（见接口层）：不能告诉攻击者「这个码存在但过期了」
 * 还是「这个邮箱根本没有码」——那等于提供了探测手段。
 */
export async function verifyCode(params: VerifyCodeParams): Promise<VerifyResult> {
  const email = params.email.trim().toLowerCase()
  const { scene } = params
  const consume = params.consume ?? true

  if (!isEmailEnabled()) {
    return { ok: false, reason: "email-disabled" }
  }

  const code = params.code.trim()
  // 形状先挡一层，避免把明显不对的输入拿去做 HMAC
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, reason: "mismatch" }
  }

  // 取该邮箱该场景**最新**的一条记录
  const record = await prisma.emailCode.findFirst({
    where: { email, scene },
    orderBy: { createdAt: "desc" },
  })
  if (!record) {
    return { ok: false, reason: "mismatch" }
  }

  if (record.consumedAt) {
    return { ok: false, reason: "used" }
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" }
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too-many-attempts" }
  }

  const expected = hashCode(email, scene, code)
  if (!safeEqualHex(expected, record.codeHash)) {
    /*
     * 比对失败：attempts + 1。
     *
     * 达到上限的那一次直接把它标记为已消费 —— 这样即使还在有效期内也无法再试，
     * 实现「超出次数后强制失效」。用 consumedAt 表达「作废」而不是新增字段，
     * 是为了让清理与查询逻辑保持简单。
     */
    const nextAttempts = record.attempts + 1
    await prisma.emailCode.update({
      where: { id: record.id },
      data: {
        attempts: nextAttempts,
        ...(nextAttempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
      },
    })
    return {
      ok: false,
      reason: nextAttempts >= MAX_ATTEMPTS ? "too-many-attempts" : "mismatch",
    }
  }

  if (consume) {
    /*
     * 用 updateMany + 条件 consumedAt: null 做**原子消费**。
     *
     * 为什么不是先查到再 update：两个并发请求可能同时通过上面的检查，
     * 于是同一个验证码被用两次（重放）。加了 `consumedAt: null` 条件后，
     * 只有一个请求能改到行，另一个拿到 count 0 —— 据此判定为已使用。
     */
    const res = await prisma.emailCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (res.count === 0) {
      return { ok: false, reason: "used" }
    }
  }

  return { ok: true }
}

// ============================================================
// 失败原因 → 用户文案
// ============================================================

/**
 * 把失败原因翻译成给用户看的中文。
 *
 * 两条原则：
 * 1. **过期 / 已用 / 次数超限 统一成一句话**，不区分具体是哪种 ——
 *    区分开来等于告诉攻击者「这个码确实存在」，提供了枚举手段
 * 2. 配额与配置类问题要**说得具体**，因为那是站长要看的：
 *    「发送失败」这种笼统文案会让站长以为是 Resend 挂了，实际可能是没配 Key
 */
export function describeFail(reason: FailReason): string {
  switch (reason) {
    case "email-disabled":
      return "邮件功能暂时关闭，请使用密码登录或联系站长"
    case "not-configured":
      return "邮件服务未配置，请联系站长"
    case "cooldown":
      return "请求过于频繁，请稍后再试"
    case "quota-email":
      return "该邮箱今日验证码次数已达上限，请明天再试"
    case "quota-ip":
      return "当前网络今日请求次数过多，请明天再试或更换网络"
    case "quota-global-daily":
      return "今日验证码发送量已达站点上限，请明天再试"
    case "quota-global-monthly":
      return "本月验证码发送量已达站点上限，请使用密码登录"
    case "expired":
    case "used":
    case "too-many-attempts":
    case "mismatch":
      // 刻意统一：不泄露「码是否存在 / 是否过期 / 是否被用过」
      return "验证码错误或已失效，请重新获取"
    case "send-failed":
      // 必须点明「邮件服务」而不是笼统的「发送失败」——
      // 否则用户会把它与「验证码错误」混淆，反复重输那个根本没发出来的码。
      return "邮件服务暂时不可用，请稍后重试"
  }
}

/** 失败原因 → HTTP 状态码 */
export function statusForFail(reason: FailReason): number {
  switch (reason) {
    case "email-disabled":
    case "not-configured":
      return 503
    case "cooldown":
    case "quota-email":
    case "quota-ip":
    case "quota-global-daily":
    case "quota-global-monthly":
      return 429
    default:
      // 验证码类失败统一 400（不区分，避免泄露内部状态）
      return 400
  }
}

/**
 * 邮箱 + 场景的指纹，仅用于日志与排查，**不可逆**。
 * 不在日志里打印明文邮箱是次要的考虑，主要目的是让日志行不至于太长。
 */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8)
}
