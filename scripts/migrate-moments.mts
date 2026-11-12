/**
 * 把旧「相册（Photo）」与「诗句（Poem）」迁移成「动态（Moment）」。
 *
 * 用法：
 *   npx tsx scripts/migrate-moments.mts            # 预演：只统计，不写库
 *   npx tsx scripts/migrate-moments.mts --commit   # 真正写入
 *
 * 设计要点：
 *  - **默认不写**：迁移是这批改动里唯一不可逆的一步，必须先看数字再落库
 *  - **可重复执行**：每条动态记录 `legacyKind` + `legacyId`（唯一索引），
 *    重跑只补没迁过的，不会重复插入
 *  - **旧表不动**：Photo / Poem 原样保留，出问题直接删 Moment 数据即可回到原状
 *  - 照片 → 一条动态 + 一张图；诗句 → 一条 kind="poem" 的动态（无图）
 */

import { config } from "dotenv"

/*
 * 直接跑 tsx 不会经过 Next.js 的环境加载，`src/lib/prisma.ts` 在模块顶层就要求
 * DATABASE_URL 已存在，所以必须先手动加载 .env / .env.local，再**动态** import。
 * 顺序不能反：静态 import 会提前执行，那时环境还没准备好。
 */
config({ path: ".env", quiet: true })
config({ path: ".env.local", quiet: true })

const { prisma } = await import("../src/lib/prisma")

const COMMIT = process.argv.includes("--commit")

function log(...args: unknown[]) {
  console.log(...args)
}

async function main() {
  const [photos, poems, existingMoments, existingImages] = await Promise.all([
    prisma.photo.findMany({ orderBy: { id: "asc" } }),
    prisma.poem.findMany({ orderBy: { id: "asc" } }),
    prisma.moment.findMany({ select: { legacyKind: true, legacyId: true } }),
    prisma.momentImage.count(),
  ])

  const migrated = new Set(
    existingMoments
      .filter((m) => m.legacyKind && m.legacyId !== null)
      .map((m) => `${m.legacyKind}:${m.legacyId}`)
  )

  const photoTodo = photos.filter((p) => !migrated.has(`photo:${p.id}`))
  const poemTodo = poems.filter((p) => !migrated.has(`poem:${p.id}`))

  log("=== 迁移计划 ===")
  log(`  相册照片：共 ${photos.length} 张，已迁移 ${photos.length - photoTodo.length}，本次待迁 ${photoTodo.length}`)
  log(`  诗句：    共 ${poems.length} 条，已迁移 ${poems.length - poemTodo.length}，本次待迁 ${poemTodo.length}`)
  log(`  现有动态：${existingMoments.length} 条，动态图片 ${existingImages} 张`)

  if (photoTodo.length > 0) {
    const categories = new Map<string, number>()
    for (const photo of photoTodo) {
      categories.set(photo.category, (categories.get(photo.category) ?? 0) + 1)
    }
    log("  照片按主题分布：", [...categories.entries()].map(([k, v]) => `${k}=${v}`).join(" "))
    log("  示例（前 3 条）：")
    for (const photo of photoTodo.slice(0, 3)) {
      log(`    #${photo.id} [${photo.category}] ${photo.title ?? "(无标题)"} — ${(photo.description ?? "").slice(0, 30)}`)
    }
  }
  if (poemTodo.length > 0) {
    log("  诗句示例（前 3 条）：")
    for (const poem of poemTodo.slice(0, 3)) {
      log(`    #${poem.id} ${poem.content.replace(/\s+/g, " ").slice(0, 30)} —— ${poem.author ?? ""}`)
    }
  }

  if (!COMMIT) {
    log("\n（预演模式，未写入任何数据。加 --commit 才会真正迁移）")
    return
  }

  if (photoTodo.length === 0 && poemTodo.length === 0) {
    log("\n没有需要迁移的数据。")
    return
  }

  let createdMoments = 0
  let createdImages = 0

  // 逐条插入：改用事务包起来，任何一条失败整体回滚，避免迁一半
  await prisma.$transaction(async (tx) => {
    for (const photo of photoTodo) {
      const moment = await tx.moment.create({
        data: {
          kind: "moment",
          topic: photo.category,
          title: photo.title,
          text: photo.description,
          published: true,
          sortOrder: photo.sortOrder,
          legacyKind: "photo",
          legacyId: photo.id,
          authorId: photo.authorId,
          createdAt: photo.createdAt,
          updatedAt: photo.updatedAt,
          images: {
            create: [
              {
                url: photo.url,
                filename: photo.filename,
                width: photo.width,
                height: photo.height,
                sortOrder: 0,
              },
            ],
          },
        },
      })
      createdMoments += 1
      createdImages += moment ? 1 : 0
    }

    for (const poem of poemTodo) {
      await tx.moment.create({
        data: {
          kind: "poem",
          topic: null,
          title: null,
          text: poem.content,
          poemAuthor: poem.author,
          poemSource: poem.source,
          published: true,
          sortOrder: poem.sortOrder,
          legacyKind: "poem",
          legacyId: poem.id,
          authorId: poem.authorId,
          createdAt: poem.createdAt,
          updatedAt: poem.updatedAt,
        },
      })
      createdMoments += 1
    }
  })

  const [momentsTotal, imagesTotal, momentCount, poemCount] = await Promise.all([
    prisma.moment.count(),
    prisma.momentImage.count(),
    prisma.moment.count({ where: { kind: "moment" } }),
    prisma.moment.count({ where: { kind: "poem" } }),
  ])

  log("\n=== 迁移完成 ===")
  log(`  本次新增动态 ${createdMoments} 条、图片 ${createdImages} 张`)
  log(`  动态总数 ${momentsTotal}（图文 ${momentCount} / 诗句 ${poemCount}），图片总数 ${imagesTotal}`)
  log(`  对账：照片 ${photos.length} ↔ 图文动态 ${momentCount}；诗句 ${poems.length} ↔ 诗句动态 ${poemCount}`)
  if (momentCount !== photos.length || poemCount !== poems.length) {
    log("  ⚠ 数量不一致，请检查是否有被删除或未迁移的旧数据")
  }
}

main()
  .catch((error) => {
    console.error("[migrate-moments] 失败：", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
