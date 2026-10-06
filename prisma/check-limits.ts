import { config as dotenvConfig } from "dotenv"
import path from "path"

// Next.js 生产环境用 .env.local，开发用 .env，两者都加载
dotenvConfig({ path: path.resolve(__dirname, "..", ".env.local"), override: false })
dotenvConfig({ path: path.resolve(__dirname, "..", ".env"), override: false })

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import {
  ArticleCreateSchema,
  CollectionSchema,
  CommentSchema,
  ProfileUpdateSchema,
  ResumeExperienceSchema,
  ResumeProfileSchema,
  ResumeSkillSchema,
  SongCreateSchema,
} from "../src/lib/validations"

/**
 * 上线前的只读预检：新的校验规则会不会卡住**已经存在**的数据。
 *
 * 为什么需要它：接口接上 zod schema 之后，一批过去不存在的长度/格式限制开始生效。
 * 已有的记录本身不会损坏，但如果它违反了新规则，就会变得「能看不能存」——
 * 在后台点保存永远失败，而错误原因不直观。上线前先跑一遍就能提前发现。
 *
 * 关键设计：这里**直接复用 /src/lib/validations 里那套 schema**，不另抄一份限制。
 * 抄一份的话，以后改了 schema 而忘了改这里，预检就会失真 ——
 * 那正是这个项目里「权限码被抄成 5 份」的同类问题。
 *
 * 只读：全程只有 findMany，不会写入任何数据。
 *
 * 已知局限：它校验的是**已有数据**，所以查不出「某个可空列暂时还没有 null 值」
 * 这种隐患 —— 那种情况要等第一批 null 出现时才会暴露。
 * schema 与数据模型的可空性是否一致，仍需人工对照 prisma/schema.prisma 复核。
 *（已经因此修过三次：Collection.coverImage、Song.link、Comment.parentId）
 *
 * 用法：
 *   npx tsx prisma/check-limits.ts
 *   npm run db:check-limits
 *
 * 退出码：发现会被卡住的记录时为 1，一切正常为 0（方便接进部署脚本）。
 */

type Issue = { 表: string; 记录: string; 问题: string }

function describeRow(row: Record<string, unknown>, ...keys: string[]): string {
  const parts = keys
    .map((k) => (row[k] === null || row[k] === undefined ? "" : String(row[k])))
    .filter((v) => v.length > 0)
  return parts.length > 0 ? parts.join(" ") : `#${row.id}`
}

/** 用 schema 校验一条记录，把 zod 的报错整理成可读的一行 */
function checkWith<
  T extends { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } } },
>(schema: T, row: Record<string, unknown>, table: string, label: string, out: Issue[]) {
  const result = schema.safeParse(row)
  if (result.success) return
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path.length > 0 ? `${String(issue.path[0])}：` : ""
    out.push({ 表: table, 记录: label, 问题: `${field}${issue.message}` })
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("未找到 DATABASE_URL，请在 .env 或 .env.local 中配置")
    process.exit(1)
  }

  const dbUrl = process.env.DATABASE_URL.replace("file:", "")
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
  })

  const issues: Issue[] = []

  try {
    // 合集：原来完全没有长度限制，现在 name ≤100 / description ≤500 / coverImage ≤500
    const collections = await prisma.collection.findMany({ orderBy: { id: "asc" } })
    for (const row of collections) {
      checkWith(CollectionSchema, row, "合集", describeRow(row, "name"), issues)
    }

    // 简历资料：原来只有「姓名必填」这一条规则
    const profiles = await prisma.resumeProfile.findMany({ orderBy: { id: "asc" } })
    for (const row of profiles) {
      checkWith(ResumeProfileSchema, row, "简历资料", describeRow(row, "name"), issues)
    }

    const experiences = await prisma.resumeExperience.findMany({ orderBy: { id: "asc" } })
    for (const row of experiences) {
      checkWith(ResumeExperienceSchema, row, "简历经历", describeRow(row, "title"), issues)
    }

    const skills = await prisma.resumeSkill.findMany({ orderBy: { id: "asc" } })
    for (const row of skills) {
      checkWith(ResumeSkillSchema, row, "简历技能", describeRow(row, "name"), issues)
    }

    // 文章：summary / coverImage 在库里有可能是 null，schema 必须容忍
    const articles = await prisma.article.findMany({ orderBy: { id: "asc" } })
    for (const row of articles) {
      checkWith(ArticleCreateSchema, row, "文章", describeRow(row, "title"), issues)
    }

    // 歌单：新表，正常没有历史数据，顺手一并检查
    const songs = await prisma.song.findMany({ orderBy: { id: "asc" } })
    for (const row of songs) {
      checkWith(SongCreateSchema, row, "歌单", describeRow(row, "title", "artist"), issues)
    }

    // 评论的 5000 字上限是**改造前就有**的（路由里手写检查过），列出来只为顺便体检
    const comments = await prisma.comment.findMany({
      select: { id: true, content: true, parentId: true },
      orderBy: { id: "asc" },
    })
    for (const row of comments) {
      checkWith(CommentSchema, row, "评论", `#${row.id}`, issues)
    }

    // 账号：ProfileUpdateSchema 要求昵称非空（昵称另有唯一约束兜底）
    const users = await prisma.user.findMany({
      select: { id: true, name: true, bio: true },
      orderBy: { id: "asc" },
    })
    for (const row of users) {
      checkWith(ProfileUpdateSchema, row, "账号", describeRow(row, "name"), issues)
    }

    // 相册分类 music 已被改造成歌单页：这些照片不会被删除，但已不在任何页面展示
    const orphanPhotos = await prisma.photo.count({ where: { category: "music" } })

    // ---- 输出 ----
    console.log("上线预检：新校验规则会不会卡住已有数据（只读，不会修改任何东西）\n")

    const counts = new Map<string, number>()
    for (const i of issues) counts.set(i.表, (counts.get(i.表) ?? 0) + 1)

    console.log(
      `扫描：合集 ${collections.length} · 简历资料 ${profiles.length} · ` +
        `经历 ${experiences.length} · 技能 ${skills.length} · 文章 ${articles.length} · ` +
        `歌单 ${songs.length} · 评论 ${comments.length} · 账号 ${users.length}`
    )

    if (issues.length === 0) {
      console.log("\n没有问题：现有数据全部符合新规则。")
    } else {
      console.log("")
      for (const [table, n] of counts) {
        console.log(`【${table}】${n} 处`)
        for (const i of issues.filter((x) => x.表 === table)) {
          console.log(`  ✗ ${i.记录}  —  ${i.问题}`)
        }
      }
      console.log(
        `\n共 ${issues.length} 处不符合接口的校验规则。` +
          "\n它们前台照常显示，但把该记录原样提交给对应接口会被拒绝。" +
          "\n可编辑的内容（合集/简历/文章/歌单）会表现为后台保存失败；" +
          "\n评论在后台只能删除、账号只能改权限，所以实际影响仅限于直接调用接口。" +
          "\n处理方式二选一：在后台把它们改到符合规则，或放宽 /src/lib/validations 里对应的限制。"
      )
    }

    if (orphanPhotos > 0) {
      console.log(
        `\n提示：相册里还有 ${orphanPhotos} 张 category='music' 的照片。` +
          "\n它们不会被删除，但「清弦」已改造成歌单页，所以不再有任何页面展示它们。" +
          "\n确实不需要的话可以清掉：DELETE FROM Photo WHERE category = 'music';"
      )
    }

    process.exitCode = issues.length > 0 ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("预检执行失败：", error)
  process.exit(1)
})
