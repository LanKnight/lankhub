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

  // Create a sample collection
  const collection = await prisma.collection.create({
    data: {
      name: "入门指南",
      slug: "getting-started",
      description: "帮助你快速上手 lankHub 的文章合集",
      sortOrder: 0,
    },
  })

  console.log("Sample collection created:", collection.name)

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
      collectionId: collection.id,
    },
  })

  console.log("Sample article created")

  // Create resume data
  const profile = await prisma.resumeProfile.create({
    data: {
      name: "张三",
      title: "全栈开发工程师",
      email: "admin@lankhub.com",
      phone: "138-xxxx-xxxx",
      location: "中国 · 上海",
      birthDate: "2000.01",
      birthplace: "浙江 · 杭州",
      degree: "本科",
      political: "共青团员",
      selfEvaluation:
        "热爱技术，自主学习能力强，善于团队协作。\n对代码质量有追求，注重用户体验。\n保持好奇心，持续探索新技术。",
      jobTarget: "全栈开发工程师 / 前端开发工程师",
      jobSummary:
        "期望能在一个有挑战性的团队中持续成长，用技术创造价值。\n保持学习，保持好奇，保持热爱。",
    },
  })

  await prisma.resumeSkill.createMany({
    data: [
      { name: "React / Next.js", level: 90, sortOrder: 0, profileId: profile.id },
      { name: "TypeScript / JavaScript", level: 88, sortOrder: 1, profileId: profile.id },
      { name: "Node.js / Express", level: 82, sortOrder: 2, profileId: profile.id },
      { name: "Python", level: 75, sortOrder: 3, profileId: profile.id },
      { name: "Docker / DevOps", level: 70, sortOrder: 4, profileId: profile.id },
    ],
  })

  await prisma.resumeExperience.createMany({
    data: [
      {
        type: "education",
        title: "XX大学",
        subtitle: "计算机科学与技术 · 本科",
        startDate: "2020",
        endDate: "2024",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "campus",
        title: "学生会技术部部长",
        description: "负责学校活动的技术支持，组织技术分享会，带领 10 人团队完成校园活动网站开发。",
        startDate: "2022",
        endDate: "2023",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "campus",
        title: "编程社团副社长",
        description: "组织每周编程 Workshop，参与 ACM 校赛并获得二等奖。",
        startDate: "2021",
        endDate: "2022",
        sortOrder: 1,
        profileId: profile.id,
      },
      {
        type: "project",
        title: "lankHub 个人博客",
        description:
          "基于 Next.js + Prisma + SQLite 构建的全栈博客系统，支持用户认证、文章管理、富文本编辑、评论功能。",
        techStack: "Next.js · TypeScript · Prisma · TailwindCSS",
        startDate: "2025",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "project",
        title: "校园二手交易平台",
        description:
          "基于 React + Node.js 的校园二手物品交易平台，支持用户注册、商品发布、搜索筛选、即时通讯。",
        techStack: "React · Express · MongoDB · Socket.io",
        startDate: "2023",
        sortOrder: 1,
        profileId: profile.id,
      },
      {
        type: "practice",
        title: "XX科技有限公司",
        subtitle: "前端开发实习生",
        description:
          "参与公司 SaaS 产品的前端开发，负责用户管理模块的重构，使用 React + TypeScript 提升代码可维护性和页面性能。",
        startDate: "2023.07",
        endDate: "2023.12",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "award",
        title: "2023 年全国大学生计算机设计大赛 三等奖",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "award",
        title: "2022 年 ACM 校赛 二等奖",
        sortOrder: 1,
        profileId: profile.id,
      },
      {
        type: "award",
        title: "2020-2023 连续三年校级奖学金",
        sortOrder: 2,
        profileId: profile.id,
      },
      {
        type: "certificate",
        title: "CET-6 英语六级",
        sortOrder: 0,
        profileId: profile.id,
      },
      {
        type: "certificate",
        title: "计算机二级",
        sortOrder: 1,
        profileId: profile.id,
      },
      {
        type: "certificate",
        title: "AWS Cloud Practitioner",
        sortOrder: 2,
        profileId: profile.id,
      },
    ],
  })

  console.log("Resume data created")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
