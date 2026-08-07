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

// 文章创建/更新
export const ArticleSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200, "标题过长"),
  slug: z.string().min(1).max(200).optional(),
  summary: z.string().max(500, "摘要过长").optional(),
  content: z.string().min(1, "内容不能为空"),
  published: z.boolean().optional(),
  pinned: z.boolean().optional(),
  collectionId: z.number().int().positive().optional().nullable(),
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
