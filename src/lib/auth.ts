import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import {
  rateLimit,
  getClientIp,
  LOGIN_ACCOUNT_MAX,
  LOGIN_IP_MAX,
  LOGIN_WINDOW_MS,
} from "@/lib/rate-limit"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // 信任反向代理的 host header（Nginx 等），生产环境必须
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // 统一邮箱格式（trim + 小写），与注册时一致，避免大小写导致登录失败
        const email = String(credentials.email).trim().toLowerCase()

        // 频率限制，两道都要有：
        //  1) 按「邮箱+IP」防针对同一账号的暴力破解
        //  2) 按「IP」防同一来源换不同邮箱撞库 —— 只有第一道的话，换个邮箱就绕过了
        const ip = getClientIp(request.headers)
        const perAccount = rateLimit(
          `login:${email}:${ip}`,
          LOGIN_ACCOUNT_MAX,
          LOGIN_WINDOW_MS
        )
        const perIp = rateLimit(`login-ip:${ip}`, LOGIN_IP_MAX, LOGIN_WINDOW_MS)
        if (!perAccount.allowed || !perIp.allowed) {
          console.log("[auth] login rate limited")
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          })

          if (!user) {
            console.log("[auth] login failed: user not found")
            return null
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          )

          if (!isValid) {
            console.log("[auth] login failed: invalid password")
            return null
          }

          return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions,
          }
        } catch (err) {
          console.error("[auth] authorize error:", err)
          return null
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.permissions = user.permissions ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? ""
        session.user.role = token.role ?? "READER"
        session.user.permissions = token.permissions ?? null
      }
      // 权限即时生效：每次会话读取时从数据库刷新角色与权限
      // （站长收回/授予权限后无需等 JWT 过期，立即反映到 session）
      try {
        const userId = token.id ? Number.parseInt(token.id, 10) : Number.NaN
        if (!Number.isFinite(userId)) return session

        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, permissions: true },
        })
        if (dbUser && session.user) {
          session.user.role = dbUser.role
          session.user.permissions = dbUser.permissions
        }
      } catch (err) {
        console.error("[auth] session db refresh error:", err)
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  secret: process.env.AUTH_SECRET,
})
