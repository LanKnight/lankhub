import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是 C++ 原生模块，必须标记为外部包
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  // 隐藏 X-Powered-By 头
  poweredByHeader: false,

  // 旧地址重定向
  async redirects() {
    return [
      {
        // 相册总览页已删除（没有进入渠道，且首页「兴趣爱好」已承担入口职责）。
        // 它曾被分类页的「返回相册总览」硬编码链接指向过，可能被搜索引擎收录，
        // 因此保留 308 永久重定向，避免旧链接和收藏变成 404。
        source: "/photos",
        destination: "/",
        permanent: true,
      },
    ];
  },

  // 安全响应头
  async headers() {
    return [
      {
        // 所有 HTML 页面和 API 路由
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // CSP 基础策略（TipTap 依赖内联样式，需放开 style-src）
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // 图片 API 额外明确 nosniff（防止上传伪装文件被浏览器嗅探）
        source: "/api/images/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
