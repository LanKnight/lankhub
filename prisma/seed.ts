import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import bcrypt from "bcryptjs"

const dbUrl = process.env.DATABASE_URL!.replace("file:", "")
const adapter = new PrismaBetterSqlite3({
  url: dbUrl,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10)

  const owner = await prisma.user.upsert({
    where: { email: "admin@lankhub.com" },
    update: {},
    create: {
      email: "admin@lankhub.com",
      password: hashedPassword,
      name: "站长",
      role: "OWNER",
      bio: "lankHub 博客站长",
    },
  })

  console.log("Owner user created:", owner.email)

  // Create a sample article
  await prisma.article.create({
    data: {
      title: "欢迎来到 lankHub",
      slug: "welcome-to-lankhub",
      summary: "这是我的第一篇博客文章，欢迎来访！",
      content: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "欢迎来到 lankHub！这是我的个人博客，在这里我会分享技术心得、生活感悟和各种有趣的内容。",
              },
            ],
          },
        ],
      }),
      published: true,
      authorId: owner.id,
    },
  })

  console.log("Sample article created")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
