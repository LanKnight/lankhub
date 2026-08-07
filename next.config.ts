import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是 C++ 原生模块，必须标记为外部包
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  // 隐藏 X-Powered-By 头
  poweredByHeader: false,

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
