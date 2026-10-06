import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner, getCurrentUser } from "@/lib/auth-helpers"
import { isPermissionCode } from "@/lib/permissions"

/**
 * 更新账号权限（站长专属）
 * body: { permissions: ["article","photo"] }（空数组 = 收回全部）
 * 保护：不能修改自己的权限、站长账号权限不可改
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params
    const targetId = parseInt(id)
    const body = await req.json()

    if (!targetId || isNaN(targetId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 })
    }

    const me = await getCurrentUser()
    if (me && parseInt(me.id) === targetId) {
      return NextResponse.json(
        { error: "不能修改自己的权限" },
        { status: 403 }
      )
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
    })
    if (!target) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 })
    }

    // 站长账号权限不可改（站长保留全部权限）
    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "站长账号的权限不可修改" },
        { status: 403 }
      )
    }

    // 规范化权限列表：仅允许已知权限码，去重
    const raw = Array.isArray(body.permissions) ? body.permissions : []
    const permissions = [
      ...new Set(raw.filter((p: unknown) => isPermissionCode(p))),
    ].join(",")

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { permissions: permissions || null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update user error:", error)
    return NextResponse.json(
      { error: "更新账号失败" },
      { status: 500 }
    )
  }
}

/**
 * 删除账号（站长专属）
 * 保护：不能删自己、不能删 OWNER 账号
 * 连带：评论/照片/诗词因外键 SetNull 自动匿名保留
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params
    const targetId = parseInt(id)

    if (!targetId || isNaN(targetId)) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 })
    }

    const me = await getCurrentUser()

    // 不能删除自己
    if (me && parseInt(me.id) === targetId) {
      return NextResponse.json(
        { error: "不能删除当前登录的账号" },
        { status: 403 }
      )
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
    })
    if (!target) {
      return NextResponse.json({ error: "账号不存在" }, { status: 404 })
    }

    // 不能删除站长账号
    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "不能删除站长账号" },
        { status: 403 }
      )
    }

    // 文章归属不可置空（schema 非空外键）：有文章时拒绝删除，避免外键错误
    const articleCount = await prisma.article.count({
      where: { authorId: targetId },
    })
    if (articleCount > 0) {
      return NextResponse.json(
        { error: `该账号有 ${articleCount} 篇文章，无法删除（文章归属不可匿名化）。请先删除或转交其文章。` },
        { status: 409 }
      )
    }

    // 删除账号（评论/照片/诗词因外键 SetNull 自动匿名保留）
    await prisma.user.delete({
      where: { id: targetId },
    })

    return NextResponse.json({ message: "账号已删除" })
  } catch (error) {
    console.error("Delete user error:", error)
    return NextResponse.json(
      { error: "删除账号失败" },
      { status: 500 }
    )
  }
}
