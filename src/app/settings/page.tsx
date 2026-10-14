import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRight, KeyRound, UserRound } from "lucide-react"
import { getCurrentUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import LogoutButton from "@/components/settings/LogoutButton"

export const metadata: Metadata = {
  title: "账号设置",
  // 个人账号页不该被搜索引擎收录
  robots: { index: false, follow: false },
}

/**
 * 账号设置**首页**：只做入口，不再把表单堆在这里。
 *
 * 原先昵称/简介、改密码、退出登录三块全部铺在同一页 ——
 * 进来就是一屏表单，想退出还得先滚到底。
 * 现在改成三个入口各进一页，首页只回答「我能在这里做什么」。
 *
 * 三个入口刻意做成**统一样式的列表行**而不是按钮：
 * 一是站点是水墨极简风格，一堆按钮太闹；
 * 二是列表行能带一句说明，比按钮上那四个字更清楚。
 */
export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login?callbackUrl=/settings")

  // 从数据库读最新值（session 里那份是登录时的快照，改完昵称不会同步）
  const me = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { name: true, email: true, role: true, emailVerifiedAt: true },
  })
  if (!me) redirect("/auth/login?callbackUrl=/settings")

  const entries = [
    {
      href: "/settings/profile",
      icon: UserRound,
      title: "个人资料",
      desc: `昵称与简介 · 当前昵称「${me.name}」`,
    },
    {
      href: "/settings/password",
      icon: KeyRound,
      title: "修改密码",
      desc: me.emailVerifiedAt
        ? "用邮箱验证码，或用旧密码"
        : "邮箱尚未验证，只能用旧密码修改",
    },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900">账号设置</h1>
        <p className="text-sm text-gray-500 mt-1">
          {me.email}
          {me.role === "OWNER" ? " · 站长" : " · 读者"}
        </p>
        {me.emailVerifiedAt === null && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            这个邮箱还没有完成验证，验证码登录与找回密码暂时不可用。
          </p>
        )}
      </div>

      {/*
        divide-y 会给**每一个相邻子元素之间**加分隔线，包括最后一行之前。
        退出登录是最后一个元素，它的上方本来就有线（那是对的），
        但这里用 `divide-y` 时最后一行下方不会多线 —— 之前看到的底部多一条
        是因为我把说明文字也留在了容器里。现在说明已移除，卡片底边就是干净的圆角。
      */}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
        {entries.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <e.icon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{e.title}</span>
              <span className="mt-0.5 block truncate text-xs text-gray-400">{e.desc}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-gray-300" />
          </Link>
        ))}

        {/*
          退出登录是**第三个入口**，与上面两个同款样式（包括右侧的箭头占位，
          否则三行的右边界不齐），但行为不同：它不跳页，而是就地弹一个轻确认。
          理由：退出是即时动作、也不可撤销，多一跳页面反而绕；
          而加确认能避免误触（它就挨着「修改密码」）。
        */}
        <LogoutButton email={me.email} />
      </div>
    </div>
  )
}
