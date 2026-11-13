"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  Bell,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  User,
  X,
} from "lucide-react"
import { resolveActiveHref } from "@/lib/nav"
import { canAccessAdmin } from "@/lib/permissions"
import { useAnnouncement } from "@/components/announcement/AnnouncementProvider"

/**
 * 站点顶栏。
 *
 * 2026-11 改版（站长要求）：
 *  - 内容导航从「首页 / 博客 / 合集 / 简历」收敛为「首页 / 博客 / 简历」
 *    （合集已经并进 /blog 的标签页，不再占顶栏）
 *  - 「管理」与「设置」两个入口合并成一个齿轮下拉：
 *    管理后台 / 账号设置 / 退出登录（未登录时显示「登录」）
 */
export default function Navbar() {
  const { data: session, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const user = session?.user
  const { show: showAnnouncement, unseen: announcementUnseen } = useAnnouncement()

  const navLinks = [
    { href: "/", label: "首页" },
    { href: "/blog", label: "博客" },
    { href: "/resume", label: "简历" },
  ]

  // 只有最长匹配的那一项高亮（/blog 是 /blog/xxx 的前缀）
  const activeHref = resolveActiveHref(
    pathname,
    navLinks.map((link) => link.href)
  )
  const isActive = (href: string) => href === activeHref

  const canManage = canAccessAdmin(user)


  // 下拉：点外面或按 Esc 关闭
  useEffect(() => {
    if (!accountOpen) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [accountOpen])

  // 路由变化时收起两个菜单
  useEffect(() => {
    setAccountOpen(false)
    setMenuOpen(false)
  }, [pathname])

  const accountMenu = (
    <div className="py-1">
      {canManage && (
        <Link
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
          onClick={() => setAccountOpen(false)}
        >
          <Sparkles size={15} className="text-gray-400" />
          管理后台
        </Link>
      )}
      <Link
        href="/settings"
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
        onClick={() => setAccountOpen(false)}
      >
        <Settings size={15} className="text-gray-400" />
        账号设置
      </Link>
      <button
        type="button"
        onClick={() => {
          setAccountOpen(false)
          void signOut({ callbackUrl: `${window.location.origin}/` })
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
      >
        <LogOut size={15} className="text-gray-400" />
        退出登录
      </button>
    </div>
  )

  return (
    <header className="site-navbar sticky top-0 z-50 bg-paper/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="text-xl font-bold text-gray-900 hover:text-gray-600 transition-colors"
            >
              lankHub
            </Link>
            <button
              type="button"
              onClick={showAnnouncement}
              aria-label={announcementUnseen ? "站点公告（有新内容）" : "站点公告"}
              title="站点公告"
              className="relative rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <Bell size={17} />
              {announcementUnseen && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-paper"
                />
              )}
            </button>
          </div>

          {/* 桌面端（后台页面也显示，站长要求保留） */}
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
                  <span
                    aria-hidden
                    className={`absolute -bottom-1.5 left-0 h-[2px] rounded-full bg-gradient-to-r from-accent via-accent to-transparent transition-all duration-300 ${
                      isActive(link.href) ? "w-full opacity-100" : "w-0 opacity-0"
                    }`}
                  />
                </Link>
              ))}

            {status === "loading" ? (
              <div className="w-16 h-8 bg-gray-100 animate-pulse rounded-sm" />
            ) : user ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label="账号菜单"
                  title="账号"
                  className="flex items-center gap-1 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <Settings size={18} />
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${accountOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                  >
                    {accountMenu}
                  </div>
                )}
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

          {/* 移动端：右侧只留汉堡 */}
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

      {/* 移动端展开菜单 */}
      <div
        className={`md:hidden border-t border-gray-100 bg-white overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? "max-h-[26rem] opacity-100" : "max-h-0 opacity-0"
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
            <div className="space-y-3">
              {canManage && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                  onClick={() => setMenuOpen(false)}
                >
                  <Sparkles size={15} className="text-gray-400" />
                  管理后台
                </Link>
              )}
              <Link
                href="/settings"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setMenuOpen(false)}
              >
                <Settings size={15} className="text-gray-400" />
                账号设置
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void signOut({ callbackUrl: `${window.location.origin}/` })
                }}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <LogOut size={15} className="text-gray-400" />
                退出登录
              </button>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="flex items-center gap-2 text-sm text-accent font-medium"
              onClick={() => setMenuOpen(false)}
            >
              <LogIn size={15} />
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
