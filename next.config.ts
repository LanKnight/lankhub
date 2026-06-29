import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是 C++ 原生模块，必须标记为外部包
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  // 隐藏 X-Powered-By 头
  poweredByHeader: false,
};

export default nextConfig;
