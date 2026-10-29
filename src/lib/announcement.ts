/**
 * 站点公告（硬编码，不做编辑器）
 * ------------------------------------------------------------------
 * 为什么要一个版本号：
 * 「以后不再提示」是**按版本记的** —— 浏览器里存的是「我看过哪个版本」，
 * 而不是一个布尔值。所以只要把下面的 `version` 改一下，
 * 所有勾过「不再提示」的人都会**再看到一次**新公告。
 *
 * 以后随版本更新：改 `version` + `updatedAt` + 文案，就这三件事。
 * 不需要数据库、不需要后台界面。
 */

/** 公告版本：改动它会让大家重新看到一次公告（建议用日期） */
export const ANNOUNCEMENT_VERSION = "2026-10-29"

/** localStorage 的键：只存"看过的版本号"一个字符串 */
export const ANNOUNCEMENT_STORAGE_KEY = "lankhub.announcement.seen"

export interface AnnouncementSection {
  title: string
  /** 一段正文 */
  body?: string
  /** 列表（用于"最近更新"这种） */
  list?: string[]
  /** 段末的跳转链接 */
  link?: { href: string; label: string }
}

export interface Announcement {
  version: string
  updatedAt: string
  title: string
  lead: string
  sections: AnnouncementSection[]
  contact: { email: string }
}

export const ANNOUNCEMENT: Announcement = {
  version: ANNOUNCEMENT_VERSION,
  updatedAt: "2026-10-29",
  title: "欢迎来到 lankHub",
  lead: "这是一个人的长期笔记：记录成长，也分享技术与生活。站点有较大改动时，这里会更新一次。",
  sections: [
    {
      title: "关于这里",
      body: "个人博客，写技术实践也写生活观察。文章按主题收进「合集」，音乐是私人歌单，简历与相册是顺带做的小页面。站内没有广告与付费内容，也不收集你的个人信息。",
    },
    {
      title: "免责说明",
      body: "文章均为个人观点与原创记录，引用会注明来源；音乐试听数据来自第三方免费接口，本站不存储、不制作、不传播音频文件，版权归原始版权方所有。若认为某处内容侵权，请用下方邮箱联系，核实后立即处理。",
      link: { href: "/disclaimer", label: "阅读完整免责声明" },
    },
    {
      title: "最近更新",
      list: [
        "首页首屏改成山水场景（常态雪山梅花，悬停转江湖武侠）",
        "文章封面统一为 2.35:1，后台提示裁切损失",
        "文章很长时右侧目录可以滚动，并跟随当前章节",
        "沉浸式听歌界面顶栏显示日期与时间",
        "新增《从 0 到 1 做一个 MCP》等技术长文",
      ],
    },
  ],
  contact: { email: "lanknight@qq.com" },
}
