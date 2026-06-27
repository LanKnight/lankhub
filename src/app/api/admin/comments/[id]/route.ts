import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { id } = await params

    const existing = await prisma.comment.findUnique({
      where: { id: parseInt(id) },
    })

    if (!existing) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 })
    }

    // Delete child replies first
    await prisma.comment.deleteMany({
      where: { parentId: parseInt(id) },
    })

    await prisma.comment.delete({
      where: { id: parseInt(id) },
    })

    return NextResponse.json({ message: "评论已删除" })
  } catch (error) {
    console.error("Delete comment error:", error)
    return NextResponse.json(
      { error: "删除评论失败" },
      { status: 500 }
    )
  }
}
