import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

/**
 * 把**存量账号**标记为「邮箱已验证」。
 *
 * ⚠️ 这个脚本必须在「邮箱验证」功能上线**之前**跑一次。
 *
 * 为什么：加了 `User.emailVerifiedAt` 之后，登录会检查它非空。
 * 存量账号的该字段是 null，于是**包括站长自己在内的所有老用户都会被
 * 「请先完成邮箱验证」挡在门外** —— 而他们根本没有收到过验证码，
 * 也就无法完成验证，等于把所有人锁在站点外面。
 *
 * 为什么默认标记「全部」而不是「只标记站长」：
 *   这个脚本是给「功能上线前」用的，那一刻库里所有账号都是没经过新流程的，
 *   理应全部视为已验证 —— 他们的邮箱在注册时是真实填写的，只是当时没有验证环节。
 *   要只处理某个账号，用 --email 指定。
 *
 * 幂等：已经是非 null 的账号不会被改动（输出里 updated 为 0）。
 * 预览：加 --dry-run 只打印将要改动的内容，不写入任何数据。
 *
 * 用法：
 *   npx tsx prisma/verify-existing.ts --dry-run
 *   npm run db:verify-existing
 *   npm run db:verify-existing -- --email someone@example.com
 */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const dryRun = process.argv.includes("--dry-run")
  // --email xxx 只处理指定账号
  const emailArgIndex = process.argv.indexOf("--email")
  const onlyEmail =
    emailArgIndex !== -1 && process.argv[emailArgIndex + 1]
      ? process.argv[emailArgIndex + 1].trim().toLowerCase()
      : null

  const dbUrl = process.env.DATABASE_URL.replace("file:", "")
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  })

  try {
    const pending = await prisma.user.findMany({
      where: {
        emailVerifiedAt: null,
        ...(onlyEmail ? { email: onlyEmail } : {}),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { id: "asc" },
    })

    const total = await prisma.user.count()

    console.log("存量账号标记为「邮箱已验证」（功能上线前必须跑一次）\n")
    console.log(`账号总数：${total}`)
    console.log(`待标记（emailVerifiedAt 为 null）：${pending.length}`)
    if (onlyEmail) console.log(`限定邮箱：${onlyEmail}`)
    console.log("")

    if (pending.length === 0) {
      console.log("没有需要处理的账号 —— 要么已经跑过了，要么库里没有账号。")
      if (total === 0) {
        console.log(
          "\n⚠️ 库里一个账号都没有。若是全新部署，先跑 npm run setup 建站长账号。"
        )
      }
      return
    }

    for (const u of pending) {
      console.log(`  · #${u.id} ${u.email}（${u.name}，${u.role}）`)
    }

    if (dryRun) {
      console.log(`\n[dry-run] 以上 ${pending.length} 个账号将被标记为已验证，未写入任何数据。`)
      console.log("去掉 --dry-run 即可真正执行。")
      return
    }

    /*
     * 用同一条 updateMany 一次改完，而不是逐个 update：
     * 既快，也避免「改到一半失败」留下半套状态。
     * 条件是 emailVerifiedAt: null，所以并发跑两次也不会互相覆盖时间戳。
     */
    const now = new Date()
    const result = await prisma.user.updateMany({
      where: { id: { in: pending.map((u) => u.id) }, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    })

    console.log(`\n✅ 已标记 ${result.count} 个账号为「邮箱已验证」（时间：${now.toISOString()}）`)
    if (result.count !== pending.length) {
      console.log(
        `   注意：实际改了 ${result.count} 个，而待处理是 ${pending.length} 个 —— ` +
          "可能有并发的其它进程同时改了数据，建议再跑一次 --dry-run 核对。"
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("脚本执行失败：", error)
  process.exit(1)
})
