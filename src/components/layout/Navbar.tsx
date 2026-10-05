"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Menu, X, User, PenLine, Settings } from "lucide-react"
import { resolveActiveHref } from "@/lib/nav"

export default function Navbar() {
  const { data: session, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  // session.user 的扩展字段由 src/types/next-auth.d.ts 声明，这里不再需要断言
  const user = session?.user

  const navLinks = [
    { href: "/", label: "首页" },
    { href: "/blog", label: "博客" },
    { href: "/blog/collections", label: "合集" },
    { href: "/resume", label: "简历" },
  ]

  // 只有最长匹配的那一项高亮：/blog 是 /blog/collections 的前缀，
  // 逐项 startsWith 会让「博客」和「合集」同时亮起
  const activeHref = resolveActiveHref(
    pathname,
    navLinks.map((link) => link.href)
  )
  const isActive = (href: string) => href === activeHref

  // 管理入口：站长 或 拥有任一内容权限（文章/相册/拾章）的授权读者
  const userPerms = (user?.permissions || "").split(",").map((p: string) => p.trim())
  const canManage =
    user?.role === "OWNER" ||
    ["article", "photo", "poem"].some((p) => userPerms.includes(p))

  /**
   * 后台页面收窄导航栏。
   *
   * 后台本来就有自己的侧栏，再叠一整条站点导航，一个屏幕上会挤到十几个入口
   * （其中「首页」出现三次、「退出」出现两次）。所以进到 /admin 后只保留
   * logo（回首页）与「设置」：内容导航在管理时没有意义，「管理」更是自己指自己。
   *
   * 用 startsWith("/admin/") 而不是 startsWith("/admin")，
   * 免得将来出现 /administration 这类路径被误判。
   */
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")

  return (
    <header className="site-navbar sticky top-0 z-50 bg-paper/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="text-xl font-bold text-gray-900 hover:text-gray-600 transition-colors"
          >
            lankHub
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {/* 后台页面不显示内容导航：管理时看这些没有意义，且侧栏已承担后台导航 */}
            {!isAdmin &&
              navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`relative text-[15px] transition-all duration-200 ${
                    isActive(link.href)
                      ? "text-gray-900 font-bold"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {link.label}
                  {/* 水墨风下划线：active 时从左到右淡出，如毛笔一划 */}
                  <span
                    aria-hidden
                    className={`absolute -bottom-1.5 left-0 h-[2px] rounded-full bg-gradient-to-r from-accent via-accent to-transparent transition-all duration-300 ${
                      isActive(link.href) ? "w-full opacity-100" : "w-0 opacity-0"
                    }`}
                  />
                </Link>
              ))}

            {status === "loading" ? (
              <div className="w-20 h-8 bg-gray-100 animate-pulse rounded-sm" />
            ) : user ? (
              <div className="flex items-center gap-3">
                {/* 已经在后台里了就不必再给「管理」入口 */}
                {canManage && !isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <PenLine size={14} />
                    管理
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Settings size={14} />
                  设置
                </Link>
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="flex items-center gap-1 text-sm px-4 py-2 bg-gray-900 text-paper rounded-sm hover:bg-gray-800 transition-colors"
              >
                <User size={14} />
                登录
              </Link>
            )}
          </nav>

          {/*
            后台页面没有内容导航可展开，汉堡菜单里会只剩「账号设置」一项，
            那就直接把这一项摆出来，省掉一次点击。
          */}
          {isAdmin ? (
            <Link
              href="/settings"
              className="md:hidden flex items-center gap-1 p-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Settings size={18} />
              设置
            </Link>
          ) : (
            <button
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="菜单"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>
      </div>

      {/*
        移动端展开菜单（仅非后台页面）。
        后台页面下整个菜单都不渲染 —— 否则从普通页面带着展开状态进到 /admin 时，
        菜单里会留下已经用不到的「管理后台」，而入口正指着当前页面。
      */}
      {!isAdmin && (
        <div
          className={`md:hidden border-t border-gray-100 bg-white overflow-hidden transition-all duration-300 ease-in-out ${
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 py-3 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`block text-sm border-l-2 pl-3 transition-colors ${
                  isActive(link.href)
                    ? "text-gray-900 font-bold border-accent"
                    : "text-gray-600 hover:text-gray-900 border-transparent"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-gray-100" />
            {status === "loading" ? (
              <div className="w-full h-8 bg-gray-100 animate-pulse rounded-sm" />
            ) : user ? (
              <>
                {canManage && (
                  <Link
                    href="/admin"
                    className="block text-sm text-gray-600 hover:text-gray-900"
                    onClick={() => setMenuOpen(false)}
                  >
                    管理后台
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="block text-sm text-gray-600 hover:text-gray-900"
                  onClick={() => setMenuOpen(false)}
                >
                  账号设置
                </Link>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="block text-sm text-accent font-medium"
                onClick={() => setMenuOpen(false)}
              >
                登录
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
