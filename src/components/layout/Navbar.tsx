"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Menu, X, LogOut, User, PenLine } from "lucide-react"

export default function Navbar() {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const user = session?.user as any

  const navLinks = [
    { href: "/", label: "首页" },
    { href: "/blog", label: "博客" },
    { href: "/blog/collections", label: "合集" },
    { href: "/resume", label: "简历" },
  ]

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
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                {user.role === "OWNER" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <PenLine size={14} />
                    管理
                  </Link>
                )}
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
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
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-3 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-sm text-gray-600 hover:text-gray-900 transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-gray-100" />
            {user ? (
              <>
                {user.role === "OWNER" && (
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
                    signOut({ callbackUrl: "/" })
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
      )}
    </header>
  )
}
