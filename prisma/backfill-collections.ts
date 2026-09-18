import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { ensureUncategorizedCollection } from "../src/lib/collections"

/**
 * 一次性数据回填：把「已发布但没有合集」的文章归入「未分类」合集。
 *
 * 背景：发布文章时现在强制要求选择合集，但服务器上已有的数据可能不满足。
 * 只处理**已发布**的文章 —— 草稿允许暂时不归类，等作者点发布时再强制选择，
 * 这样正好逼着旧草稿补一次归类。
 *
 * 幂等：重复执行不会新建第二个合集，也不会动已经有合集的文章。
 * 预览：加 --dry-run 只打印将要改动的内容，不写入任何数据。
 *
 * 用法：
 *   npx tsx prisma/backfill-collections.ts --dry-run
 *   npm run db:backfill-collections
 */
const dryRun = process.argv.includes("--dry-run")

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const dbUrl = process.env.DATABASE_URL.replace("file:", "")
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  })

  try {
    const where = { published: true, collectionId: null }

    const targets = await prisma.article.findMany({
      where,
      select: { id: true, title: true, slug: true },
      orderBy: { id: "asc" },
    })

    console.log(`已发布但没有合集的文章：${targets.length} 篇`)
    for (const article of targets) {
      console.log(`  #${article.id}  ${article.title}`)
    }

    if (targets.length === 0) {
      console.log("无需回填，未创建任何合集。")
      return
    }

    if (dryRun) {
      console.log("\n--dry-run：仅预览，未写入任何数据。")
      console.log("去掉 --dry-run 后执行即可完成回填。")
      return
    }

    const fallback = await ensureUncategorizedCollection(prisma)
    console.log(
      `\n兜底合集：#${fallback.id} ${fallback.name}（${fallback.created ? "本次新建" : "已存在，复用"}）`
    )

    // 用 updateMany 而不是逐个更新：条件与上面的查询一致，
    // 保证只影响"已发布且无合集"的行
    const result = await prisma.article.updateMany({
      where,
      data: { collectionId: fallback.id },
    })

    console.log(`已把 ${result.count} 篇文章归入「${fallback.name}」。`)
    console.log("草稿未受影响（发布时会被要求选择合集）。")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
