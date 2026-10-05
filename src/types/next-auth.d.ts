import type { DefaultSession } from "@auth/core/types"

/**
 * Auth.js 的类型增强。
 *
 * ⚠️ 增强的目标模块必须写「声明处」，不能写再导出的模块。
 * 本项目用的是 next-auth@5 beta：Session / User 声明在 `@auth/core/types`，
 * JWT 声明在 `@auth/core/jwt`；而 `next-auth` 与 `next-auth/jwt` 都只是
 * `export * from ...` 的转发，写在那两个模块上不会生效（这里踩过一次）。
 *
 * 项目一直在 session / token 上挂 id、role、permissions，但从来没声明过，
 * 于是每一处读写都得 `as any`（光 src/lib/auth.ts 里就有 14 处）。
 *
 * role 声明为 string 而不是 "OWNER" | "READER"：数据库里 role 是自由字符串
 * （见 prisma/schema.prisma），声明成联合类型反而会在读取处产生新的类型摩擦。
 * 收窄放在 auth-helpers.getCurrentUser 里做。
 */
declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string
      role: string
      permissions?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role?: string
    permissions?: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    role?: string
    permissions?: string | null
  }
}
