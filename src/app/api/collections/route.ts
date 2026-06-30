import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const collections = await prisma.collection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { articles: { where: { published: true } } },
      },
    },
  })

  // Only return collections that have at least one published article
  const visible = collections.filter((c) => c._count.articles > 0)

  return NextResponse.json(
    visible.map(({ _count, ...rest }) => ({
      ...rest,
      articleCount: _count.articles,
    }))
  )
}
