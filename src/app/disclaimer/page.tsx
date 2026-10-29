import type { Metadata } from "next"
import { ViewTransition } from "react"
import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { ANNOUNCEMENT } from "@/lib/announcement"
import BackLink from "@/components/ui/BackLink"

export const metadata: Metadata = {
  title: "免责声明",
  description: "lankHub 的站点性质、内容版权、第三方数据、隐私与侵权处理说明",
}

/**
 * 全站免责声明。
 *
 * 与 /music/disclaimer 的关系：那个页面是「清弦音乐」的专项声明（讲第三方接口
 * 与音频版权），这里讲全站。两者不重复：总则放在这里，音乐细则仍在那页，
 * 这里只做引导链接。
 */
const CLAUSES: { title: string; body: string; extra?: "contact" | "music" }[] = [
  {
    title: "站点性质",
    body: "本站是个人非盈利博客，用于记录与分享。站内没有广告、没有付费内容、也没有任何形式的会员服务，不以此获利。",
  },
  {
    title: "内容与版权",
    body: "站内文章、图片与排版除特别注明外均为本人原创，版权归本人所有。欢迎转载与引用，但请注明作者与原文链接，且不得用于商业用途。引用他人作品时会尽量标注来源，若标注有误或遗漏，请通过下方邮箱告知。",
  },
  {
    title: "第三方内容与音乐",
    body: "音乐试听功能的数据来自第三方免费接口，本站不存储、不制作、不传播任何音频文件，播放时由浏览器直接向接口返回的地址取流；音乐、歌词、封面的版权均归原始版权方所有。本站不提供任何下载入口，请勿将播放地址用于下载或二次分发。",
    extra: "music",
  },
  {
    title: "外部链接",
    body: "站内可能包含指向外部网站的链接。这些网站的内容、隐私政策与可用性由对方负责，本站不对其作出任何保证，也不承担因其产生的责任。",
  },
  {
    title: "隐私与本地存储",
    body: "本站不收集你可识别的个人信息，不做用户画像，也不向第三方出售或共享数据。评论与登录功能只保存必要的账号信息；公告的「以后不再提示」仅保存在你浏览器本地（localStorage），可随时清除浏览器数据来重置。",
  },
  {
    title: "责任限制",
    body: "站内内容按「现状」提供，我会尽力保证准确，但不对其完整性、时效性与适用性作出保证。因参考本站内容而产生的任何直接或间接损失，本站不承担责任。",
  },
  {
    title: "侵权处理",
    body: "若你认为本站内容侵犯了你的合法权益，请通过下方邮箱说明具体页面与理由，核实后会在第一时间删除或修正。",
    extra: "contact",
  },
  {
    title: "条款变更",
    body: "本声明可能随站点功能调整而更新，更新后即在本页生效。重大变更会在站点公告中提示。继续使用本站即视为接受更新后的条款。",
  },
]

export default async function DisclaimerPage() {
  /*
   * 邮箱优先取简历资料（与音乐免责页同一个数据源，避免出现第二个真相源），
   * 没填时退回公告里那个公开邮箱 —— 公告里既然公布了，就一定有值。
   */
  const profile = await prisma.resumeProfile.findFirst({ select: { email: true } })
  const email = profile?.email?.trim() || ANNOUNCEMENT.contact.email

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-4 py-12 pb-24">
          <BackLink fallbackHref="/" className="mb-8" />

          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <ShieldAlert size={26} className="text-gray-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">免责声明</h1>
            <p className="mt-2 text-sm text-gray-500">适用于 lankHub 全站</p>
          </div>

          <ol className="space-y-6">
            {CLAUSES.map((clause, index) => (
              <li key={clause.title} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{clause.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{clause.body}</p>

                  {clause.extra === "music" && (
                    <Link
                      href="/music/disclaimer"
                      className="mt-1.5 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      查看音乐功能的专项声明
                    </Link>
                  )}

                  {clause.extra === "contact" && (
                    <p className="mt-2 text-sm text-gray-900">
                      邮箱：
                      <a href={`mailto:${email}`} className="text-accent underline">
                        {email}
                      </a>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-12 border-t border-gray-100 pt-6 text-center text-xs leading-relaxed text-gray-400">
            本页面如与第三方接口提供方的条款冲突，以对方条款为准。
            若本站将来出现任何盈利行为，将立即停止使用相关第三方接口。
          </p>
        </div>
      </div>
    </ViewTransition>
  )
}
