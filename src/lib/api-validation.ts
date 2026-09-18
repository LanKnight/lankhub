import { NextResponse } from "next/server"
import type { ZodError } from "zod"

/**
 * 统一的参数校验失败响应（400）。
 *
 * - `error` 取第一条问题的消息，前端现有的 `data.error` 读取方式可直接沿用
 * - `issues` 保留全部问题与字段路径，便于排查是哪个字段不合法
 */
export function validationErrorResponse(error: ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))

  return NextResponse.json(
    { error: issues[0]?.message ?? "请求参数不合法", issues },
    { status: 400 }
  )
}
