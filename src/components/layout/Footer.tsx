import Link from "next/link"
import { Mail, Heart } from "lucide-react"

function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z" />
    </svg>
  )
}

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-gray-100 bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Links */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-accent transition-colors"
            >
              首页
            </Link>
            <Link
              href="/blog"
              className="text-sm text-gray-500 hover:text-accent transition-colors"
            >
              博客
            </Link>
            <Link
              href="/resume"
              className="text-sm text-gray-500 hover:text-accent transition-colors"
            >
              简历
            </Link>
          </div>

          {/* Social */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="GitHub"
            >
              <GithubIcon size={20} />
            </a>
            <a
              href="mailto:admin@lankhub.com"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Email"
            >
              <Mail size={20} />
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
            © {currentYear} lankHub · Made with
            <Heart size={12} className="text-red-400" />
            · 记录成长，分享生活
          </p>
        </div>
      </div>
    </footer>
  )
}
