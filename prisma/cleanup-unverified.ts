import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

/**
 * 删除「注册后一直没验证邮箱」的僵尸账号。
 *
 * 为什么必须有：注册流程是「先建号（未验证）+ 再输码验证」。
 * 如果有人注册了却从不验证（或是被脚本批量注册），就会在库里留下大量垃圾账号。
 * 这些账号登不上、也不该长期占着邮箱唯一索引 —— 邮箱被占住之后，
 * **真正的主人也注册不了自己的邮箱**。
 *
 * 保留时长默认 24 小时（可用 --hours 覆盖）：
 * 太短会把「注册完去忙别的事、第二天才回来输码」的正常用户误删；
 * 太长则垃圾账号堆积。24 小时是个折中。
 *
 * ⚠️ 只删 `emailVerifiedAt` 为 null 的账号 —— **绝不会碰任何已验证用户**。
 * ⚠️ 它有级联影响：User 到 Article / Comment / Photo / Poem / Song 是 onDelete 关系，
 *    但一个从未验证过的账号不可能发过内容（他连登都登不上），所以实际不会连带删掉东西。
 *    即便如此，脚本仍会先统计并打印将要删除的账号，让你能看一眼再决定。
 *
 * 幂等：没有可删的账号时输出 cleaned 为 0。
 * 预览：加 --dry-run 只打印，不删除。
 *
 * 用法：
 *   npx tsx prisma/cleanup-unverified.ts --dry-run
 *   npm run db:cleanup-unverified
 *   npm run db:cleanup-unverified -- --hours 48
 *
 * 建议挂 crontab 每天跑一次（见 docs/emailAuthDevDoc.md 第 7.4 节）。
 */

/** 默认保留时长（小时）。注册后超过这个时间还没验证的账号会被清理 */
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
    // 截止时间：创建时间早于此值的未验证账号会被清理
    const cutoff = new Date(Date.now() - keepHours * 60 * 60 * 1000)

    const zombies = await prisma.user.findMany({
      where: { emailVerifiedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })

    const pendingCount = await prisma.user.count({
      where: { emailVerifiedAt: null },
    })
    const verifiedCount = await prisma.user.count({
      where: { emailVerifiedAt: { not: null } },
    })

    console.log("清理「注册后一直未验证邮箱」的僵尸账号\n")
    console.log(`保留时长：${keepHours} 小时（创建时间早于 ${cutoff.toISOString()} 的未验证账号会被删）`)
    console.log(`账号统计：已验证 ${verifiedCount} · 未验证 ${pendingCount}（其中已超期 ${zombies.length}）`)
    console.log("")

    if (zombies.length === 0) {
      console.log("没有需要清理的账号。")
      if (pendingCount > 0) {
        console.log(`\n提示：还有 ${pendingCount} 个未验证账号，但都还没超过 ${keepHours} 小时。`)
      }
      return
    }

    for (const u of zombies) {
      console.log(`  · #${u.id} ${u.email}（${u.name}，创建于 ${u.createdAt.toISOString()}）`)
    }

    if (dryRun) {
      console.log(`\n[dry-run] 以上 ${zombies.length} 个账号将被删除，未改动任何数据。`)
      console.log("去掉 --dry-run 即可真正执行。")
      return
    }

    /*
     * 逐个删而不是 deleteMany：
     * 万一某个账号因为某种原因（例如将来加了外键约束）删不掉，
     * 逐个删能让失败只影响那一条，并在日志里明确指出是哪个，而不是整批回滚。
     * 数量本来就不大（垃圾账号通常几十个量级），性能不是问题。
     */
    let deleted = 0
    const failures: { id: number; email: string; reason: string }[] = []
    for (const u of zombies) {
      try {
        await prisma.user.delete({ where: { id: u.id } })
        deleted += 1
      } catch (err) {
        failures.push({
          id: u.id,
          email: u.email,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    console.log(`\n✅ 已删除 ${deleted} 个僵尸账号`)
    if (failures.length > 0) {
      console.log(`\n⚠️ 有 ${failures.length} 个删除失败（通常是有关联数据）：`)
      for (const f of failures) {
        console.log(`  ✗ #${f.id} ${f.email} — ${f.reason}`)
      }
      console.log("  这些账号可能有内容关联，请人工确认后再处理。")
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("脚本执行失败：", error)
  process.exit(1)
})
