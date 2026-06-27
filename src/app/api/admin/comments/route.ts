import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"

export async function GET() {
  const authError = await requireOwner()
  if (authError) return authError

  const comments = await prisma.comment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
      article: {
        select: { id: true, title: true, slug: true },
      },
    },
  })

  return NextResponse.json(comments)
}
