"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  ImageIcon,
  MessageSquare,
  FileUser,
  ScrollText,
  Users,
  Headphones,
  type LucideIcon,
} from "lucide-react"

import { resolveActiveHref } from "@/lib/nav"
import { type PermissionCode, userHasPermission } from "@/lib/permissions"

interface AdminLink {
  href: string
  label: string
  icon: LucideIcon
  /** 需要的权限码；null 表示仅站长可见。加了类型约束后，权限码写错 tsc 会直接报错 */
  perm: PermissionCode | null
}

const links: AdminLink[] = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard, perm: null },
  { href: "/admin/articles", label: "文章管理", icon: FileText, perm: "article" },
  { href: "/admin/collections", label: "合集管理", icon: FolderOpen, perm: null },
  { href: "/admin/photos", label: "相册管理", icon: ImageIcon, perm: "photo" },
  { href: "/admin/poems", label: "拾章管理", icon: ScrollText, perm: "poem" },
  // perm 为 null = 仅站长可见（歌单是站长私人的收藏）
  { href: "/admin/music", label: "歌单管理", icon: Headphones, perm: null },
  { href: "/admin/comments", label: "评论管理", icon: MessageSquare, perm: null },
  { href: "/admin/resume", label: "简历编辑", icon: FileUser, perm: null },
  { href: "/admin/users", label: "账号管理", icon: Users, perm: null },
]

interface AdminSidebarProps {
  /**
   * 会话信息由后台布局（服务端组件）传入，这里刻意不用 useSession()。
   *
   * 原因：useSession 在服务端拿不到会话，权限过滤会把所有菜单都滤掉，
   * 于是 SSR 出来的是一个空的 <nav>，要等客户端水合才填上 ——
   * 用户会看到一瞬间的空侧栏。后台布局本来就已经读到了用户，直接传进来即可。
   * （导航栏 Navbar 没有跟着改：它在根布局里，改成服务端读会话会让全站
   *   每个页面都变成动态渲染，代价远大于那一瞬骨架屏。）
   */
  role: string
  permissions: string | null
}

export default function AdminSidebar({ role, permissions }: AdminSidebarProps) {
  const pathname = usePathname()
  const user = { role, permissions }
  const isOwner = role === "OWNER"

  // 站长看全部；读者只显示自己有权限的模块（站长专属菜单一律隐藏）
  const visibleLinks = isOwner
    ? links
    : links.filter(
        (link) => link.perm !== null && userHasPermission(user, link.perm)
      )

  // 同 Navbar：取最长匹配。原来用 `link.href !== "/admin"` 特例绕开
  // 「/admin 是所有后台页面的前缀」这个问题，现在统一交给同一套逻辑
  const activeHref = resolveActiveHref(
    pathname,
    visibleLinks.map((link) => link.href)
  )

  return (
    <aside className="w-full md:w-56 bg-gray-900 text-white md:min-h-[calc(100vh-4rem)] p-4 flex flex-col">
      {/* 移动端：横向滚动菜单；桌面端：纵向固定侧栏 */}
      <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0">
        {visibleLinks.map((link) => {
          const isActive = link.href === activeHref
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/*
        这里原先还有「回首页」与「退出登录」两块，现在都去掉了：
          · 回首页 —— 顶部导航栏的 logo 就是回首页，同一屏里出现三次没有意义
          · 退出   —— 统一收进 /settings（站长与读者都从那里退）
        顺带也消掉了原先桌面端/移动端两套重复实现 ——
        那两套里移动端还漏了「回首页」，不对称。
      */}
    </aside>
  )
}
