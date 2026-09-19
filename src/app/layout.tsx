import type { Metadata } from "next"
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import Navbar from "@/components/layout/Navbar"
import Footer from "@/components/layout/Footer"
import BackToTop from "@/components/layout/BackToTop"
import NavHistoryTracker from "@/components/layout/NavHistory"
import { ToastProvider } from "@/components/ui/Toast"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// 注意：本版本 Next 的字体元数据不含 chinese-simplified 子集（仅 latin/cyrillic 等），
// 中文字形通过 globals.css 的系统宋体栈兜底（SimSun / Songti SC），保证水墨风一致。
const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
})

export const metadata: Metadata = {
  title: {
    default: "lankHub — 个人博客",
    template: "%s | lankHub",
  },
  description: "记录成长，分享技术与生活 — lankHub 个人博客",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      // Next 16 起不再默认覆盖全局的 scroll-behavior: smooth，
      // 不加这个属性路由跳转（含后退）会把滚动做成平滑动画而不是瞬间到位。
      // 加上它恢复旧行为：导航瞬间定位，页内锚点仍是平滑滚动。
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavHistoryTracker />
        <SessionProvider refetchOnWindowFocus={false}>
          <ToastProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <BackToTop />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
