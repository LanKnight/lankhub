import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { RegisterRequestSchema } from "@/lib/validations"
import { describeFail, sendCode, statusForFail } from "@/lib/email/verify-code"

/**
 * 注册**第一步**：创建（或更新）一个**未验证**账号，并发一封验证码邮件。
 *
 * 真正的「注册完成」发生在 POST /api/auth/verify-code 校验通过、把
 * `emailVerifiedAt` 写上的那一刻。这样设计的理由：
 *
 * 1. **解决「可以用别人的邮箱注册」** —— 账号虽然被创建，但 `emailVerifiedAt`
 *    为 null 就登不上（登录接口会拦），而只有邮箱主人才收得到验证码。
 * 2. 邮箱唯一索引仍然生效，不会出现同一个邮箱两条记录。
 *
 * ⚠️ 与改造前最重要的行为差异：**邮箱已被占用时明确返回 409**。
 * 改造前是「假装注册成功」（防邮箱枚举），结果是用户拿到一句
 * 「注册成功」却根本登不上，卡在一个没有出口的死角里。
 * 现在改为明确告知 —— 这不构成账号劫持，因为攻击者拿不到邮件、无法完成验证。
 * （详细取舍见 docs/emailAuthDevDoc.md 第 3.4 节）
 */

/** Prisma 把唯一约束冲突报成 P2002；用鸭子类型判断，避免耦合生成客户端的导出 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  )
}

/** P2002 的 meta.target 在 SQLite 下是索引名（如 User_name_key），据此区分是哪一列冲突 */
function conflictedColumn(error: unknown): string {
  const target = (error as { meta?: { target?: unknown } }).meta?.target
  return String(target ?? "")
}

export async function POST(req: NextRequest) {
  /*
   * 频率限制：每个 IP 每小时最多注册 30 次。
   *
   * 为什么从 10 放宽到 30：学校、公司、网吧常用同一个出口 IP，
   * 10 次很容易被正常用户撞到，而注册本身还要过「邮箱验证」这一关 ——
   * 真正防滥注册的是邮箱验证 + 发码配额，这里只是挡脚本批量灌号。
   * 原来的 10 连一次正常的端到端测试都跑不完（实测被挡）。
   */
  const ip = getClientIp(req.headers)
  const limitResult = rateLimit(`register:${ip}`, 30, 60 * 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 })
  }

  try {
    const body = await req.json().catch(() => null)

    // 校验与规范化全部交给 zod：trim、邮箱小写、长度上限都在 schema 里
    const parsed = RegisterRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }
    const { name, email, password } = parsed.data

    // 昵称唯一：可以给明确提示。它不泄露邮箱是否已注册，不存在枚举风险
    const nameTaken = await prisma.user.findFirst({
      where: { name, NOT: { email } },
      select: { id: true },
    })
    if (nameTaken) {
      return NextResponse.json({ error: "该昵称已被使用，请换一个" }, { status: 409 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })

    // 邮箱已被**已验证**账号占用 → 明确报错，让用户去登录
    if (existing && existing.emailVerifiedAt !== null) {
      return NextResponse.json(
        { error: "该邮箱已注册，请直接登录" },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    if (existing) {
      /*
       * 邮箱被一个**未验证**账号占用 → 覆盖它，而不是报错。
       *
       * 为什么必须覆盖：这种账号是「上次注册到一半就放弃了」留下的
       * （可能没收到邮件、可能关掉了页面）。若报「已注册」，用户会卡死 ——
       * 那个账号他登不上（未验证），也没有别的入口能继续。
       * 覆盖是唯一不卡人的做法，而且**已验证账号绝不会走到这里**。
       */
      await prisma.user.update({
        where: { id: existing.id },
        data: { name, password: hashedPassword },
      })
      console.log(`[register] 覆盖未验证账号 #${existing.id}`)
    } else {
      await prisma.user.create({
        data: { name, email, password: hashedPassword, role: "READER" },
      })
    }

    // 发验证码。失败时如实返回，但**账号已经建好了** —— 用户可以直接重试发码，
    // 不必重新填一遍表单（重试会走上面的「覆盖未验证账号」分支）。
    const sent = await sendCode({ email, scene: "register", ip })
    if (!sent.ok) {
      return NextResponse.json(
        { error: describeFail(sent.reason), detail: sent.detail, needVerify: true, email },
        { status: statusForFail(sent.reason) }
      )
    }

    return NextResponse.json(
      {
        message: "验证码已发送到你的邮箱，请查收",
        needVerify: true,
        email,
      },
      { status: 201 }
    )
  } catch (error) {
    // 并发注册同一个昵称/邮箱时，上面的查询会同时放行，靠唯一索引兜底
    if (isUniqueViolation(error)) {
      if (conflictedColumn(error).includes("name")) {
        return NextResponse.json({ error: "该昵称已被使用，请换一个" }, { status: 409 })
      }
      // 邮箱并发冲突：另一个请求刚刚建好了账号，让它走重试
      return NextResponse.json(
        { error: "该邮箱正在注册中，请稍后重试", needVerify: true },
        { status: 409 }
      )
    }

    console.error("Register error:", error)
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 })
  }
}
