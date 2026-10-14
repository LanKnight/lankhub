/*
 * 数据库体检：账号、验证码、测试残留、内容表行数。
 *
 * 用途：跑完测试或复现脚本后确认没有留下垃圾数据。
 * 之前每次都用 node -e 写临时 SQL，在 PowerShell 里的引号转义反复出错
 * （同一个坑踩了四次），所以收成一个文件。
 *
 * 用法：
 *   npx tsx scripts/db-state.mts            # 只体检，报告测试残留
 *   npx tsx scripts/db-state.mts --clean    # 顺手把测试残留删掉
 *
 * 为什么收成文件：之前每次都用 `node -e`/`tsx -e` 写临时 SQL，
 * 在 PowerShell 里引号与 `$` 的转义反复出错（同一个坑踩了五次，
 * 包括 `$disconnect` 被 PowerShell 当成变量吃掉）。
 */
import { config as dotenvConfig } from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
dotenvConfig({ path: path.join(root, ".env.local"), override: false })
dotenvConfig({ path: path.join(root, ".env"), override: false })

const shouldClean = process.argv.includes("--clean")

const { PrismaClient } = await import("../src/generated/prisma/client")
const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3")

const dbUrl = (process.env.DATABASE_URL ?? "file:./dev.db").replace("file:", "")
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) })

/** 测试与复现脚本可能用到的邮箱形态 */
const TEST_PATTERNS = [
  "@test.local",
  "repro%",
  "ui-check-%",
  "interact%",
  "probe%",
  "diag-%",
  "xff%",
  "code-%",
  "apitest%",
  "nobody%",
  "ghost%",
  "cooldown%",
  "sendfail%",
  "unverified%",
  "newnick%",
]

function isTestEmail(email: string): boolean {
  return TEST_PATTERNS.some((p) =>
    p.startsWith("@") ? email.endsWith(p) : email.startsWith(p.replace("%", ""))
  )
}

try {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true },
    orderBy: { id: "asc" },
  })

  console.log("=== 账号 ===")
  if (users.length === 0) {
    console.log("  （无）")
  }
  for (const u of users) {
    const flag = isTestEmail(u.email) ? "  ⚠️ 测试残留" : ""
    console.log(
      `  #${u.id} ${u.email}（${u.name}，${u.role}）已验证=${u.emailVerifiedAt ? "是" : "否"}${flag}`
    )
  }
  console.log(`  共 ${users.length} 个`)

  const leftovers = users.filter((u) => isTestEmail(u.email))
  console.log(
    leftovers.length > 0
      ? `\n  ✗ 有 ${leftovers.length} 个测试残留账号，建议清理`
      : "\n  ✓ 没有测试残留账号"
  )

  const codes = await prisma.emailCode.count()
  console.log(`\n=== 验证码记录 ===\n  ${codes} 条`)

  console.log("\n=== 内容表行数 ===")
  const tables: [string, () => Promise<number>][] = [
    ["Article", () => prisma.article.count()],
    ["Collection", () => prisma.collection.count()],
    ["Comment", () => prisma.comment.count()],
    ["Photo", () => prisma.photo.count()],
    ["Poem", () => prisma.poem.count()],
    ["Song", () => prisma.song.count()],
  ]
  for (const [name, fn] of tables) {
    console.log(`  ${name.padEnd(12)} ${await fn()}`)
  }

  const tmpSongs = await prisma.song.count({ where: { title: { contains: "__" } } })
  if (tmpSongs > 0) console.log(`\n  ✗ 有 ${tmpSongs} 首临时测试歌残留`)

  /*
   * --clean：把测试残留删掉。
   *
   * 这件事很重要，不只是「看着干净」：
   * **全站发信配额是按全表统计的**，残留的验证码记录会把
   * 「刚好差 1 条时仍可发」那类配额测试挤爆，失败信息看起来像
   * 「配额逻辑坏了」，实际只是脏数据（实测踩过）。
   */
  if (shouldClean) {
    console.log("\n=== 清理 ===")
    const du = await prisma.user.deleteMany({ where: { email: { contains: "test.local" } } })
    const dc = await prisma.emailCode.deleteMany({})
    const ds = await prisma.song.deleteMany({ where: { title: { contains: "__" } } })
    console.log(`  删除测试账号 ${du.count} 个`)
    console.log(`  删除验证码记录 ${dc.count} 条`)
    console.log(`  删除临时歌 ${ds.count} 首`)

    const left = await prisma.user.findMany({ select: { email: true } })
    console.log(`\n  剩余账号 ${left.length} 个：`)
    for (const u of left) console.log(`    ${u.email}`)
  }

  process.exitCode = !shouldClean && (leftovers.length > 0 || tmpSongs > 0) ? 1 : 0
} finally {
  await prisma.$disconnect()
}
