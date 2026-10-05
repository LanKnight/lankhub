import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { RegisterSchema } from "@/lib/validations"

/** Prisma 把唯一约束冲突报成 P2002；这里不改用 error class 而做鸭子类型判断，避免耦合生成客户端的导出 */
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
  // 频率限制：每个 IP 每小时最多注册 10 次
  const ip = getClientIp(req.headers)
  const limitResult = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    )
  }

  try {
    const body = await req.json().catch(() => null)

    // 校验与规范化全部交给 zod：trim、邮箱小写、昵称上限都在 schema 里。
    // 之前这里手写过一套平行规则，结果和 RegisterSchema 漂移了
    // （schema 有 max(50)，接口没有；纯空白昵称也能过）。
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }
    const { name, email, password } = parsed.data

    // 昵称唯一：这里可以给明确提示。它不泄露邮箱是否已注册，不存在枚举风险
    const nameTaken = await prisma.user.findUnique({ where: { name } })
    if (nameTaken) {
      return NextResponse.json(
        { error: "该昵称已被使用，请换一个" },
        { status: 409 }
      )
    }

    // 邮箱已存在时统一返回成功 shape，防邮箱枚举（沿用原有策略）
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      console.log("[register] duplicate email attempt")
      return NextResponse.json({ message: "注册成功" }, { status: 201 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "READER",
      },
    })

    return NextResponse.json(
      {
        message: "注册成功",
        user: { id: user.id, name: user.name, email: user.email },
      },
      { status: 201 }
    )
  } catch (error) {
    // 并发注册同一个昵称/邮箱时，上面的查询会同时放行，
    // 这时靠数据库的唯一索引兜底，把它翻译回同一套提示
    if (isUniqueViolation(error)) {
      if (conflictedColumn(error).includes("name")) {
        return NextResponse.json(
          { error: "该昵称已被使用，请换一个" },
          { status: 409 }
        )
      }
      // 邮箱冲突同样不暴露是否存在
      return NextResponse.json({ message: "注册成功" }, { status: 201 })
    }

    console.error("Register error:", error)
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    )
  }
}
