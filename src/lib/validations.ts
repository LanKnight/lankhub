import { z } from "zod"

import { isSafeUrl } from "@/lib/utils"

/*
 * 让 zod 内置的类型错误也说中文。
 *
 * 不设的话，字段**完全缺失**时（例如请求体里压根没有 name）返回的是
 * `Invalid input: expected string, received undefined` —— 英文且对用户没意义。
 * 注意这只影响类型层错误；带自定义文案的规则（.min/.max/.email 等）不受影响。
 */
z.config(z.locales.zhCN())

/**
 * 分页参数。
 *
 * 用 .catch 兜底而不是让 min/max 直接失败：`?page=abc` 这类脏查询串
 * 在改造前是回退到默认值的（parseInt(...) || 1），改成 400 属于行为变更。
 * limit 越界用 transform 夹取到 1–50，与原来的 Math.min/max 语义一致。
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce
    .number()
    .int()
    .catch(10)
    .transform((n) => Math.min(50, Math.max(1, n))),
})

// ID 参数
export const IdSchema = z.coerce.number().int().positive()

/**
 * 昵称：trim 后 1-20 字。
 *
 * 唯一性不放在这里 —— 那需要查库，属于业务规则；数据库上另有 @unique 兜底并发注册。
 * 上限 20 与 prisma/normalize-usernames.ts 里的 MAX_LEN 必须一致。
 */
const NicknameSchema = z
  .string()
  .trim()
  .min(1, "请填写昵称")
  .max(20, "昵称不能超过 20 个字")

/**
 * 邮箱：trim + 转小写后再校验。
 *
 * 规范化必须在这里做完：SQLite 的 unique 是大小写敏感的，
 * 不在入口统一小写就会出现 A@x.com 与 a@x.com 两个账号。
 */
const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email("请输入有效的邮箱地址"))

const PasswordSchema = z
  .string()
  .min(6, "密码长度至少 6 位")
  .max(128, "密码过长")

// 注册
export const RegisterSchema = z.object({
  name: NicknameSchema,
  email: EmailSchema,
  password: PasswordSchema,
})

/** 个人资料更新（昵称 + 简介；头像暂不开放给普通用户） */
export const ProfileUpdateSchema = z.object({
  name: NicknameSchema,
  // User.bio 在库里可空，所以同时接受 null（保持 schema 不比数据模型更严格）
  bio: z.string().trim().max(200, "个人简介不能超过 200 字").optional().nullable(),
})

/** 修改密码 */
export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "请输入当前密码"),
  newPassword: PasswordSchema,
})

// 歌单。上限与 src/lib/music.ts 里的解析器保持一致
const SongTitleSchema = z
  .string()
  .trim()
  .min(1, "请填写歌名")
  .max(100, "歌名过长")
const SongArtistSchema = z
  .string()
  .trim()
  .min(1, "请填写歌手")
  .max(100, "歌手名过长")
const SongLinkSchema = z
  .string()
  .trim()
  .max(500, "链接过长")
  .refine((v) => v === "" || isSafeUrl(v), "链接仅支持 http/https 或站内相对路径")
  .optional()
  .nullable()

/** 新增一首歌 */
export const SongCreateSchema = z.object({
  title: SongTitleSchema,
  artist: SongArtistSchema,
  link: SongLinkSchema,
  favorite: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

/** 更新一首歌（局部更新语义，字段全部可选） */
export const SongUpdateSchema = z.object({
  title: SongTitleSchema.optional(),
  artist: SongArtistSchema.optional(),
  link: SongLinkSchema,
  favorite: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

/**
 * 把歌绑定到音乐接口。
 *
 * 每首歌要「1 次搜索 + 2 次抓取」，而官方限流是 60 次 / 5 分钟，
 * 所以一次最多 6 首（约 12 次调用），由前端分批循环。
 */
export const SONG_BIND_BATCH_MAX = 6

export const SongBindItemSchema = z.object({
  songId: z.number().int().positive(),
  apiId: z.string().trim().min(1, "缺少播放 ID").max(200),
  picId: z.string().trim().max(200).optional().nullable(),
  lyricId: z.string().trim().max(200).optional().nullable(),
  album: z.string().trim().max(200).optional().nullable(),
})

export const SongBindSchema = z.object({
  items: z
    .array(SongBindItemSchema)
    .min(1, "没有要绑定的歌曲")
    .max(SONG_BIND_BATCH_MAX, `一次最多绑定 ${SONG_BIND_BATCH_MAX} 首`),
  /** 同批里判定「源站无原版」的歌，标记为 nomatch，避免下次重复搜索 */
  markNoMatch: z.array(z.number().int().positive()).max(50).optional(),
})

/** 解绑：指定几首，或 all 清除全部 */
export const SongUnbindSchema = z.object({
  songIds: z.array(z.number().int().positive()).max(200).optional(),
  all: z.boolean().optional(),
})

/** 批量导入：只带上文本，解析交给 parseSongLines（与客户端预览同一份逻辑） */
export const SongImportSchema = z.object({
  text: z.string().min(1, "请先粘贴内容").max(200_000, "内容过长"),
})

// 评论
export const CommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "评论内容不能为空")
    .max(5000, "评论内容过长，最多 5000 字"),
  // Comment.parentId 在库里可空（顶层评论就是 null）。
  // 只写 .optional() 的话，把一条顶层评论原样回传会被判为非法。
  parentId: z.number().int().positive().optional().nullable(),
})

// 文章字段。创建与更新共用，更新时全部可选（保持 PUT 的局部更新语义，
// 不能给字段加 default —— 否则未传的字段会被默认值覆盖掉）
const articleFields = {
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题过长"),
  // summary / coverImage 在库里是可空的，同样要接受 null（理由见 CollectionSchema）
  summary: z.string().max(500, "摘要过长").optional().nullable(),
  // 刻意只校验"非空字符串"，不校验是否为合法 TipTap JSON：
  // 库里可能存在早期以 HTML 存储的正文，收紧会让这些文章无法再编辑
  content: z.string().min(1, "内容不能为空"),
  coverImage: z.string().max(500, "封面地址过长").optional().nullable(),
  published: z.boolean().optional(),
  pinned: z.boolean().optional(),
  collectionId: z.number().int().positive("合集 ID 不合法").nullable().optional(),
}

/** 创建文章 */
export const ArticleCreateSchema = z.object(articleFields)

/** 更新文章 */
export const ArticleUpdateSchema = z.object({
  ...articleFields,
  title: articleFields.title.optional(),
  content: articleFields.content.optional(),
})

/**
 * 发布前置条件：已发布的文章必须归属某个合集。
 *
 * 用在「生效值」上（更新时 = 请求体与库中现有值合并后的结果），
 * 而不是直接用在请求体上 —— 否则只改标题的请求会绕过这条规则。
 */
export const PublishRequirementSchema = z
  .object({
    published: z.boolean(),
    collectionId: z.number().int().positive().nullable(),
  })
  .refine((data) => !data.published || data.collectionId !== null, {
    message: "发布文章时必须选择所属合集",
    path: ["collectionId"],
  })

/** 后台文章列表分页（保留原有默认 limit=20，新增上限 50 防止拉全表） */
export const AdminArticleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * 合集创建。
 *
 * 刻意不收 slug：它由服务端从名称生成（generateSlug）并在重名时加后缀，
 * 让客户端传 slug 会变成可控的 URL，没有好处。原 schema 里的 slug 字段
 * 接口从来没读过，属于会误导人的东西。
 * coverImage 是接口实际在用、而原 schema 漏掉的字段 ——
 * zod 默认会剥掉未知字段，漏一个就是静默丢数据。
 */
export const CollectionSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称过长"),
  // 这两个字段在库里是可空的（String?），所以必须同时接受 null ——
  // 只写 .optional() 的话，一条 description/coverImage 为 null 的旧记录
  // 一旦被客户端原样回传就会 400。schema 不该比数据模型更严格。
  description: z.string().max(500, "描述过长").optional().nullable(),
  coverImage: z.string().trim().max(500, "封面地址过长").optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
})

/**
 * 合集更新：PUT 是局部更新语义（未传的字段保持原值），
 * 所以必须用 partial —— 否则只改描述的请求会因为缺 name 而 400。
 */
export const CollectionUpdateSchema = CollectionSchema.partial()

/**
 * 简历资料。
 *
 * 字段必须与 /api/admin/resume 的 PUT 用到的完全一致：
 * 原 schema 只覆盖了 15 个字段里的 11 个，漏掉 avatar / hobbies / resumePdf，
 * 直接套上去会把这三项静默丢掉。
 * resumePdf 的路径合法性在路由里另有更严格的正则校验（防止路径穿越）。
 */
export const ResumeProfileSchema = z.object({
  name: z.string().trim().min(1, "姓名为必填项").max(100, "姓名过长"),
  title: z.string().max(200, "职位过长").optional(),
  email: z.string().email("邮箱格式不正确").max(200).optional().or(z.literal("")),
  phone: z.string().max(50, "电话过长").optional(),
  location: z.string().max(200, "所在地过长").optional(),
  avatar: z.string().max(500, "头像地址过长").optional().nullable(),
  birthDate: z.string().max(50).optional(),
  birthplace: z.string().max(200).optional(),
  degree: z.string().max(100).optional(),
  political: z.string().max(100).optional(),
  selfEvaluation: z.string().max(2000, "自我评价过长").optional(),
  jobTarget: z.string().max(200, "求职意向过长").optional(),
  jobSummary: z.string().max(2000, "求职摘要过长").optional(),
  hobbies: z.string().max(1000, "兴趣爱好过长").optional(),
  resumePdf: z.string().max(500).optional().nullable(),
})

/** 简历技能（保存时整批替换） */
export const ResumeSkillSchema = z.object({
  name: z.string().trim().min(1, "技能名不能为空").max(100, "技能名过长"),
  level: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

/** 简历经历（保存时整批替换） */
export const ResumeExperienceSchema = z.object({
  type: z.string().trim().min(1, "经历类型不能为空").max(50),
  title: z.string().trim().min(1, "经历标题不能为空").max(200, "标题过长"),
  subtitle: z.string().max(200).optional().nullable(),
  startDate: z.string().max(50).optional().nullable(),
  endDate: z.string().max(50).optional().nullable(),
  description: z.string().max(5000, "描述过长").optional().nullable(),
  techStack: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
})

/** 简历保存的完整请求体 */
export const ResumeSaveSchema = z.object({
  profile: ResumeProfileSchema,
  skills: z.array(ResumeSkillSchema).max(100, "技能过多").optional(),
  experiences: z.array(ResumeExperienceSchema).max(200, "经历过多").optional(),
})
