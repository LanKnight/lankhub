import { headers } from "next/headers"

import { prisma } from "./prisma"

/**
 * 发布令牌：给「本地批量发布文章」用的一条受控旁路。
 *
 * 为什么需要它：
 * 本地发布脚本要调 `/api/admin/articles` 与 `/api/upload`，这些接口本来只认登录会话。
 * 让脚本去伪造站长会话意味着把 `AUTH_SECRET`（能伪造任何人的登录）放在本机；
 * 而运维 MCP 的 SSH 密钥在服务器上被锁成固定动作，也读不到那个密钥。
 * 所以改成一把**只能做发布**的独立令牌：可随时更换，泄露了也只影响发布动作。
 *
 * 约定：
 *  - 请求头 `x-publish-token` 必须与服务器环境变量 `PUBLISH_TOKEN` 完全一致
 *  - `PUBLISH_TOKEN` 未配置（或过短）时，这条旁路直接关闭
 *  - 令牌身份等同「站长」，但不产生会话、不影响任何登录态
 */
export const PUBLISH_TOKEN_HEADER = "x-publish-token"

/** 请求是否携带了有效的发布令牌 */
export async function hasValidPublishToken(): Promise<boolean> {
  const expected = process.env.PUBLISH_TOKEN
  // 没配置或配得太短就当作不支持，避免空令牌误放行
  if (!expected || expected.length < 16) return false

  const provided = (await headers()).get(PUBLISH_TOKEN_HEADER) ?? ""
  if (provided.length !== expected.length) return false

  // 定长比较，避免按字符提前返回带来的时序差异
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * 令牌对应的身份 = 站点站长。
 * 返回的形状与 getCurrentUser() 对齐（id 是字符串），方便直接复用现有鉴权分支。
 */
export async function getPublishTokenOwner() {
  if (!(await hasValidPublishToken())) return null

  const owner = await prisma.user.findFirst({
    where: { role: "OWNER" },
    select: { id: true, email: true, name: true, role: true, permissions: true },
  })
  if (!owner) return null

  return {
    id: String(owner.id),
    email: owner.email,
    name: owner.name,
    // 按 where: { role: "OWNER" } 查出来的，这里确定是 OWNER 字面量，
    // 才能与 AuthUser 的类型对齐（数据库字段本身是 string）
    role: owner.role as "OWNER",
    permissions: owner.permissions,
  }
}
