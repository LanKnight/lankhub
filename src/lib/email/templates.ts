/**
 * 验证码邮件的模板。
 *
 * ⚠️ 四个场景**共用一份 HTML**，只替换标题与引导语。
 * 不这么做的后果是四份 HTML 各自漂移：改了一处配色，另外三封还是旧的。
 *
 * 同时输出 `text` 纯文本版本：部分客户端（或用户设置）屏蔽 HTML，
 * 只发 HTML 会让人收到一封空白邮件。
 */

/** 验证码用途。加场景时这里与 verify-code.ts 的取值必须同步 */
export type EmailScene = "register" | "login" | "reset" | "change"

/** 每个场景的标题与引导语 */
const SCENE_COPY: Record<EmailScene, { subject: string; heading: string; lead: string }> = {
  register: {
    subject: "注册验证码",
    heading: "注册验证",
    lead: "你正在注册账号，请使用下面的验证码完成验证：",
  },
  login: {
    subject: "登录验证码",
    heading: "登录验证",
    lead: "你正在使用验证码登录，请使用下面的验证码：",
  },
  reset: {
    subject: "重置密码验证码",
    heading: "重置密码",
    lead: "你正在重置密码，请使用下面的验证码：",
  },
  change: {
    subject: "修改密码验证码",
    heading: "修改密码",
    lead: "你正在修改密码，请使用下面的验证码：",
  },
}

/**
 * 验证码有效期（分钟）。
 *
 * **这里是唯一真相源** —— verify-code.ts 的过期时间也从这里取，
 * 避免「邮件里写 10 分钟、实际 5 分钟就失效」这种让人抓狂的错位。
 */
export const CODE_TTL_MINUTES = 10

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

export function renderCodeEmail({
  scene,
  code,
  siteName,
}: {
  scene: EmailScene
  code: string
  siteName: string
}): RenderedEmail {
  const copy = SCENE_COPY[scene]

  // 主题带上站名，便于用户在邮箱里按「lankHub」搜出所有本站邮件
  const subject = `【${siteName}】${copy.subject}`

  /*
   * 样式与站点保持一致：白底、细灰边框、克制的圆角，不堆渐变与阴影。
   * 全部用内联样式 —— 邮件客户端对外部/内嵌 <style> 的支持很不一致。
   */
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 28px 8px;">
      <p style="margin:0 0 20px;font-size:15px;color:#111827;font-weight:600;">${siteName}</p>
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.5;color:#111827;font-weight:600;">${copy.heading}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">${copy.lead}</p>
    </div>

    <div style="padding:0 28px;">
      <div style="padding:18px 0;text-align:center;background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;">
        <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${code}</span>
      </div>
    </div>

    <div style="padding:20px 28px 28px;">
      <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#6b7280;">
        验证码 ${CODE_TTL_MINUTES} 分钟内有效，请勿转发或告知他人。
      </p>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">
        如果这不是你本人的操作，忽略这封邮件即可，你的账号不会有任何变化。
      </p>
    </div>

    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #f0f0f1;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
        此邮件由 ${siteName} 自动发送，请勿直接回复。
      </p>
    </div>
  </div>
</body>
</html>`

  const text = [
    `${siteName} · ${copy.heading}`,
    "",
    copy.lead,
    "",
    `    ${code}`,
    "",
    `验证码 ${CODE_TTL_MINUTES} 分钟内有效，请勿转发或告知他人。`,
    "如果这不是你本人的操作，忽略这封邮件即可，你的账号不会有任何变化。",
    "",
    `此邮件由 ${siteName} 自动发送，请勿直接回复。`,
  ].join("\n")

  return { subject, html, text }
}
