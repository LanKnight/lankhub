import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

/** 与 src/lib/validations.ts 里的昵称上限保持一致 */
const MAX_LEN = 20

/**
 * 一次性数据规范化：整理存量用户昵称。
 *
 * 背景：昵称此前没有任何校验 —— 接口只判断 `!name`（`"   "` 是 truthy，能过），
 * 数据库也没有唯一约束。现在要给 User.name 加 @unique，直接 db push 会因为这些
 * 脏数据失败，所以必须先跑这个脚本。
 *
 * 处理顺序：
 *   1. 含 U+FFFD（编码损坏）的整条替换为 user-<id> —— 原始字节已丢失、无法还原，
 *      而残留字符（实测是一个孤立的 "û"）比占位名更容易误导人；
 *      反正现在用户可以在 /settings 页自己改昵称
 *   2. 其余去掉首尾空白
 *   3. 空了就用 user-<id> 兜底
 *   4. 截断到 20 字
 *   5. 重名按 id 顺序保留第一个，其余依次追加 -2、-3…（并保证总长仍在 20 字内）
 *
 * 幂等：再跑一次不会改动任何数据（输出里 changed 为 0）。
 * 预览：加 --dry-run 只打印将要改动的内容，不写入任何数据。
 *
 * 用法：
 *   npx tsx prisma/normalize-usernames.ts --dry-run
 *   npm run db:normalize-usernames
 */

/** 规范化单条昵称；repairId 用于生成兜底名 */
function normalizeName(raw: string, repairId: number): string {
  if (raw.includes("\uFFFD")) return `user-${repairId}`
  return raw.trim()
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const dryRun = process.argv.includes("--dry-run")
  const dbUrl = process.env.DATABASE_URL.replace("file:", "")
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  })

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { id: "asc" },
    })

    const taken = new Set<string>()
    const changes: { id: number; email: string; from: string; to: string }[] = []

    for (const user of users) {
      let next = normalizeName(user.name, user.id)
      if (!next) next = `user-${user.id}`
      if (next.length > MAX_LEN) next = next.slice(0, MAX_LEN)

      // 重名：保留第一个，其余追加序号，同时保证后缀不会把长度顶超
      if (taken.has(next)) {
        const base = next
        let n = 2
        do {
          const suffix = `-${n}`
          next = base.slice(0, MAX_LEN - suffix.length) + suffix
          n += 1
        } while (taken.has(next))
      }
      taken.add(next)

      if (next !== user.name) {
        changes.push({ id: user.id, email: user.email, from: user.name, to: next })
      }
    }

    console.log(`用户总数：${users.length}`)
    console.log(`需要整理的昵称：${changes.length} 条`)
    for (const c of changes) {
      console.log(`  #${c.id}  ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}  (${c.email})`)
    }

    if (changes.length === 0) {
      console.log("无需整理，昵称已满足唯一约束。")
      return
    }

    if (dryRun) {
      console.log("\n--dry-run：仅预览，未写入任何数据。")
      console.log("去掉 --dry-run 后执行即可完成整理。")
      return
    }

    for (const c of changes) {
      await prisma.user.update({ where: { id: c.id }, data: { name: c.to } })
    }
    console.log(`\n已整理 ${changes.length} 条昵称。`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
