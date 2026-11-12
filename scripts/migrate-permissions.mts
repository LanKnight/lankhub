/**
 * 一次性：把废弃的权限码（photo / poem）改写成 moment。
 *
 * 用法：
 *   npx tsx scripts/migrate-permissions.mts            # 预演
 *   npx tsx scripts/migrate-permissions.mts --commit    # 写入
 *
 * 背景：权限从「文章 / 相册 / 拾章」改成「文章 / 动态」，相册与拾章的权限码废弃，
 * 统一归到 moment。读取侧（src/lib/permissions.ts）已经会把 photo/poem 当 moment，
 * 所以就算这个脚本没跑，那位读者也还能进后台；跑它的目的是把库里那串值
 * 也改干净，避免用户管理界面显示得对不上。
 *
 * 可重复执行：没有可改的行时直接退出。
 */

import { config } from "dotenv"

config({ path: ".env", quiet: true })
config({ path: ".env.local", quiet: true })

const { prisma } = await import("../src/lib/prisma")

const COMMIT = process.argv.includes("--commit")

const LEGACY: Record<string, string> = { photo: "moment", poem: "moment" }
const VALID = new Set(["article", "moment"])

function normalize(raw: string | null): string | null {
  if (!raw) return raw
  const codes = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => LEGACY[p] ?? p)
    .filter((p) => VALID.has(p))
  const unique = [...new Set(codes)]
  // 保持稳定顺序：article 在 moment 前，界面勾选顺序一致
  unique.sort((a, b) => (a === "article" ? -1 : b === "article" ? 1 : 0))
  return unique.length > 0 ? unique.join(",") : null
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, permissions: true },
  })

  console.log("=== 权限码迁移 ===")
  const changes: { id: number; email: string; from: string | null; to: string | null }[] = []

  for (const user of users) {
    const to = normalize(user.permissions)
    if (to !== (user.permissions ?? null)) {
      changes.push({ id: user.id, email: user.email, from: user.permissions, to })
    }
  }

  console.log(`  用户总数 ${users.length}，需要修改 ${changes.length} 个`)
  for (const change of changes) {
    console.log(`    #${change.id} ${change.email}: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`)
  }

  if (changes.length === 0) {
    console.log("\n没有需要迁移的权限。")
    return
  }

  if (!COMMIT) {
    console.log("\n（预演模式，未写入。加 --commit 才会真正修改）")
    return
  }

  await prisma.$transaction(
    changes.map((change) =>
      prisma.user.update({
        where: { id: change.id },
        data: { permissions: change.to },
      })
    )
  )

  console.log(`\n已更新 ${changes.length} 个用户的权限。`)
  const after = await prisma.user.findMany({ select: { id: true, email: true, permissions: true } })
  for (const user of after) {
    console.log(`    #${user.id} ${user.email}: ${JSON.stringify(user.permissions)}`)
  }
}

main()
  .catch((error) => {
    console.error("[migrate-permissions] 失败：", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
