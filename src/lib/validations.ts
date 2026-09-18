import { z } from "zod"

// 分页参数
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

// ID 参数
export const IdSchema = z.coerce.number().int().positive()

// 注册
export const RegisterSchema = z.object({
  name: z.string().min(1, "请填写用户名").max(50, "用户名过长"),
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度至少6位").max(128, "密码过长"),
})

// 评论
export const CommentSchema = z.object({
  content: z
    .string()
    .min(1, "评论内容不能为空")
    .max(5000, "评论内容过长，最多 5000 字"),
  parentId: z.number().int().positive().optional(),
})

// 文章字段。创建与更新共用，更新时全部可选（保持 PUT 的局部更新语义，
// 不能给字段加 default —— 否则未传的字段会被默认值覆盖掉）
const articleFields = {
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题过长"),
  summary: z.string().max(500, "摘要过长").optional(),
  // 刻意只校验"非空字符串"，不校验是否为合法 TipTap JSON：
  // 库里可能存在早期以 HTML 存储的正文，收紧会让这些文章无法再编辑
  content: z.string().min(1, "内容不能为空"),
  coverImage: z.string().max(500, "封面地址过长").optional(),
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

// 合集创建/更新
export const CollectionSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(100, "名称过长"),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(500, "描述过长").optional(),
  sortOrder: z.number().int().min(0).optional(),
})

// 简历资料更新
export const ResumeProfileSchema = z.object({
  name: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  birthDate: z.string().max(50).optional(),
  birthplace: z.string().max(200).optional(),
  degree: z.string().max(100).optional(),
  political: z.string().max(100).optional(),
  selfEvaluation: z.string().max(2000).optional(),
  jobTarget: z.string().max(200).optional(),
  jobSummary: z.string().max(2000).optional(),
})
