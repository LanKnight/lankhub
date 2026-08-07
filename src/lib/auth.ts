import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

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

        const email = credentials.email as string

        // 频率限制：每个邮箱+IP 每分钟最多 5 次登录尝试
        const ip = getClientIp(request as unknown as Request)
        const limitResult = rateLimit(`login:${email}:${ip}`, 5, 60 * 1000)
        if (!limitResult.allowed) {
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
        ;(token as any).id = user.id
        ;(token as any).role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = (token as any).id
        ;(session.user as any).role = (token as any).role
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  secret: process.env.AUTH_SECRET,
})
