import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

/**
 * 删除过期的邮箱验证码记录。
 *
 * 为什么必须有：每次「发送验证码」都会往 EmailCode 插一行。
 * 验证码 10 分钟就过期，但记录**不会自己消失** —— 不清理的话表会一直涨，
 * 而且全站配额统计要扫这张表，表越大越慢。
 *
 * 保留时长默认 24 小时（可用 --hours 覆盖）：
 * 比验证码有效期（10 分钟）长得多，是为了保留一小段排查窗口 ——
 * 用户来反馈「验证码收不到/用不了」时还能查到刚才那几条记录的去向。
 * 记录里只有哈希，没有明文，留着也不泄露验证码。
 *
 * 幂等：没有可删的记录时 cleaned 为 0。
 * 预览：加 --dry-run 只打印统计，不删除。
 *
 * 用法：
 *   npx tsx prisma/cleanup-codes.ts --dry-run
 *   npm run db:cleanup-codes
 *
 * 建议挂 crontab 每天跑一次（见 docs/emailAuthDevDoc.md 第 7.4 节）。
 */

/** 默认保留时长（小时） */
const DEFAULT_KEEP_HOURS = 24

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const dryRun = process.argv.includes("--dry-run")
  const hoursArgIndex = process.argv.indexOf("--hours")
  const keepHours =
    hoursArgIndex !== -1 && process.argv[hoursArgIndex + 1]
      ? Number.parseInt(process.argv[hoursArgIndex + 1], 10)
      : DEFAULT_KEEP_HOURS

  if (!Number.isFinite(keepHours) || keepHours <= 0) {
    console.error(`--hours 需要一个正整数，收到：${process.argv[hoursArgIndex + 1]}`)
    process.exit(1)
  }

  const dbUrl = process.env.DATABASE_URL.replace("file:", "")
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  })

  try {
    const cutoff = new Date(Date.now() - keepHours * 60 * 60 * 1000)

    const total = await prisma.emailCode.count()
    const stale = await prisma.emailCode.count({
      where: { createdAt: { lt: cutoff } },
    })
    // 顺带报一下近 24 小时的发码量：这是核对 Resend 配额最直接的依据
    const last24h = await prisma.emailCode.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    // 各场景分布，便于发现异常刷量
    const byScene = await prisma.emailCode.groupBy({
      by: ["scene"],
      _count: { _all: true },
      where: { createdAt: { gte: cutoff } },
    })

    console.log("清理过期的邮箱验证码记录\n")
    console.log(`保留时长：${keepHours} 小时（创建时间早于 ${cutoff.toISOString()} 的记录会被删）`)
    console.log(`记录总数：${total} · 待清理：${stale}`)
    console.log(`近 24 小时新增：${last24h}（Resend 免费额度为 100 封/天，可据此核对）`)
    if (byScene.length > 0) {
      console.log("近段各场景发码量：")
      for (const row of byScene) {
        console.log(`  · ${row.scene}：${row._count._all}`)
      }
    }
    console.log("")

    if (stale === 0) {
      console.log("没有需要清理的记录。")
      return
    }

    if (dryRun) {
      console.log(`[dry-run] 将删除 ${stale} 条记录，未改动任何数据。`)
      console.log("去掉 --dry-run 即可真正执行。")
      return
    }

    const result = await prisma.emailCode.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    console.log(`✅ 已删除 ${result.count} 条过期验证码记录`)
    console.log(`   剩余 ${await prisma.emailCode.count()} 条`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("脚本执行失败：", error)
  process.exit(1)
})
