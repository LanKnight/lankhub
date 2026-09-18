import type { PrismaClient } from "@/generated/prisma/client"

/**
 * 兜底合集的标识。
 *
 * 「发布必须选合集」这条规则需要一个永远存在的去处：
 * - 历史数据里已发布但没有合集的文章
 * - 删掉某个合集时，它下面的文章
 *
 * 识别时 slug 和 name 都认：服务器上的历史数据可能有同名合集，
 * 只按 slug 找会重复建一个。
 */
export const UNCATEGORIZED_SLUG = "uncategorized"
export const UNCATEGORIZED_NAME = "未分类"

export interface UncategorizedCollection {
  id: number
  name: string
  slug: string
  /** 本次调用是否新建了合集 */
  created: boolean
}

/** 判断某个合集是否为兜底合集（删它会让文章无处可去，所以禁止删除） */
export function isUncategorizedCollection(collection: {
  name: string
  slug: string
}): boolean {
  return (
    collection.slug === UNCATEGORIZED_SLUG ||
    collection.name === UNCATEGORIZED_NAME
  )
}

/**
 * 查找或创建「未分类」合集（幂等）。
 *
 * 查找顺序：先 slug 再 name —— slug 是唯一索引，命中即确定；
 * name 兜住"历史数据里已有同名合集但 slug 不同"的情况。
 * 都没有才新建，并把 sortOrder 排到所有合集之后。
 */
export async function ensureUncategorizedCollection(
  db: PrismaClient
): Promise<UncategorizedCollection> {
  const select = { id: true, name: true, slug: true } as const

  const bySlug = await db.collection.findUnique({
    where: { slug: UNCATEGORIZED_SLUG },
    select,
  })
  if (bySlug) return { ...bySlug, created: false }

  const byName = await db.collection.findFirst({
    where: { name: UNCATEGORIZED_NAME },
    select,
    orderBy: { id: "asc" },
  })
  if (byName) return { ...byName, created: false }

  const last = await db.collection.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })

  const created = await db.collection.create({
    data: {
      name: UNCATEGORIZED_NAME,
      slug: UNCATEGORIZED_SLUG,
      description: "未归类的文章（发布时未选择合集，或原合集已被删除）",
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select,
  })

  return { ...created, created: true }
}
