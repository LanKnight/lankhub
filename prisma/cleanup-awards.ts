import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

/**
 * 一次性数据清理：删除 type 为 "award" 的经历记录。
 *
 * 背景：获奖荣誉在数据模型里只是 experiences 的一个 type 取值，但代码里
 * 从未实现过对应的展示与编辑入口 —— 前台 /resume 不渲染它，后台简历表单
 * 也没有这一项。也就是说它是一批永远读不到、也改不了的死数据。
 *
 * 种子里已不再写入，这个脚本用于清理历史上已经入库的那几条。
 *
 * 幂等：重复执行第二次会报 0 条，不会报错。
 * 预览：加 --dry-run 只打印将要删除的内容，不写入任何数据。
 *
 * 用法：
 *   npx tsx prisma/cleanup-awards.ts --dry-run
 *   npm run db:cleanup-awards
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
    // 精确锁定 type，不用 title 之类的模糊条件
    const where = { type: "award" }

    const targets = await prisma.resumeExperience.findMany({
      where,
      select: { id: true, title: true, subtitle: true },
      orderBy: { id: "asc" },
    })

    console.log(`待清理的获奖记录：${targets.length} 条`)
    for (const item of targets) {
      console.log(`  #${item.id}  ${item.title}${item.subtitle ? `（${item.subtitle}）` : ""}`)
    }

    if (targets.length === 0) {
      console.log("没有需要清理的获奖记录。")
      return
    }

    if (dryRun) {
      console.log("\n--dry-run：仅预览，未删除任何数据。")
      console.log("去掉 --dry-run 后执行即可完成清理。")
      return
    }

    const result = await prisma.resumeExperience.deleteMany({ where })
    console.log(`\n已删除 ${result.count} 条获奖记录。`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
