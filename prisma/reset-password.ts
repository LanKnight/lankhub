import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import bcrypt from "bcryptjs"
import * as readline from "readline"

if (!process.env.DATABASE_URL) {
  console.error("❌ 未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
  process.exit(1)
}

const rawDbUrl = process.env.DATABASE_URL
const dbUrl = path.resolve(rawDbUrl.replace("file:", ""))
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function main() {
  console.log("=== lankHub 重置站长密码 ===\n")

  // 查找站长账号（默认邮箱 admin@lankhub.com）
  const owner = await prisma.user.findFirst({
    where: { email: "admin@lankhub.com" },
  })

  if (!owner) {
    console.log("❌ 没有找到站长账号（admin@lankhub.com）")
    process.exit(1)
  }

  console.log(`找到站长账号: ${owner.email} (${owner.name})\n`)

  // 输入新密码
  let newPassword = ""
  while (newPassword.length < 6) {
    newPassword = await ask("请输入新密码（至少 6 位）: ")
    if (newPassword.length < 6) {
      console.log("密码太短，请至少输入 6 位\n")
    }
  }

  const confirm = await ask("确认修改？(y/n): ")
  if (confirm.toLowerCase() !== "y") {
    console.log("已取消")
    process.exit(0)
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: owner.id },
    data: { password: hashed },
  })

  console.log(`\n✅ 密码已更新！`)
  console.log(`   邮箱: ${owner.email}`)
  console.log(`   新密码: ${newPassword}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
