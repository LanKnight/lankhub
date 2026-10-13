import { NextResponse } from "next/server"
import {
  apiKeyFingerprint,
  getEmailApiKey,
  getEmailFrom,
  getSiteName,
  isEmailEnabled,
} from "@/lib/email/sender"

/**
 * 邮件配置自检（**只读，不发信、不消耗额度**）。
 *
 * 存在的理由：`pm2 env 0 | grep -i resend` 只能证明 PM2 的进程表里有变量，
 * 而这个接口证明的是**跑在 PM2 里的那个 Node 进程真的读到了**。
 * 本站实测过 `pm2 env 0 | grep -i resend` 无输出，所以这个接口是必要的。
 *
 * ⚠️ 返回值里**绝不含 Key 的任何字符**，只有长度。
 * 之前本站就因为文档里写了 Key 的前 8 个字符而被迫吊销重发，
 * 这里不再犯（见 docs/emailAuthDevDoc.md 第 1.4 节）。
 *
 * 也不做「调一次 Resend 验证 Key」——那会消耗发信额度。
 * 真正的连通性验证由一个需服务器 root 权限的手动脚本负责：
 *   npx tsx scripts/email-test.ts 你的邮箱
 */
export async function GET() {
  const key = getEmailApiKey()
  const from = getEmailFrom()

  return NextResponse.json({
    enabled: isEmailEnabled(),
    /** Key 是否读到（核心指标） */
    keyLoaded: key !== null,
    /** 只回长度，不回内容 */
    keyLength: key?.length ?? 0,
    keyFingerprint: apiKeyFingerprint(),
    /** 前缀是否符合 Resend 的格式约定（re_ 开头）——不打印实际字符 */
    keyFormatLooksValid: key ? key.startsWith("re_") : false,
    from,
    /** 发件地址的域名部分，便于核对是否属于已验证域名 */
    fromDomain: from.includes("@") ? from.split("@")[1] : null,
    siteName: getSiteName(),
    checkedAt: new Date().toISOString(),
  })
}
