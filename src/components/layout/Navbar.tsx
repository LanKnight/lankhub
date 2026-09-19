"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Menu, X, LogOut, User, PenLine } from "lucide-react"
import { resolveActiveHref } from "@/lib/nav"

export default function Navbar() {
  const { data: session, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const user = session?.user as any

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

  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur-md border-b border-gray-200">
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
            {navLinks.map((link) => (
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
                {canManage && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <PenLine size={14} />
                    管理
                  </Link>
                )}
                <button
                  onClick={() => signOut({ callbackUrl: window.location.origin + "/" })}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
                >
                  <LogOut size={14} />
                  退出
                </button>
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

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="菜单"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile nav（展开/收起动画） */}
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
              <button
                onClick={() => {
                  signOut({ callbackUrl: window.location.origin + "/" })
                  setMenuOpen(false)
                }}
                className="block text-sm text-red-500"
              >
                退出登录
              </button>
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
    </header>
  )
}
