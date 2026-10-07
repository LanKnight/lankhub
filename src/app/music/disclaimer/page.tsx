import type { Metadata } from "next"
import { ViewTransition } from "react"
import { ShieldAlert } from "lucide-react"
import { prisma } from "@/lib/prisma"
import BackLink from "@/components/ui/BackLink"

export const metadata: Metadata = {
  title: "免责声明 · 清弦",
  description: "本站音乐功能的数据来源、版权归属与使用条款说明",
}

/** 声明正文。侵权联系方式单独从简历资料里取，见下方注释 */
const CLAUSES: { title: string; body: string }[] = [
  {
    title: "数据来源",
    body: "本站音乐数据来源于第三方免费接口「GD音乐台」（music.gdstudio.xyz）。本站仅将其用于个人学习与技术演示，不存储、不制作、不传播任何音频文件，播放时由浏览器直接向该接口返回的地址取流。",
  },
  {
    title: "版权归属",
    body: "本站展示与播放的所有音乐、歌词、封面等内容的版权，均归其原始版权方所有。本站不对这些内容的版权归属作出任何声明或保证。",
  },
  {
    title: "非商业用途",
    body: "本站为个人非盈利网站，不提供任何形式的付费服务，不投放广告，不用于商业用途。所有内容仅供个人学习、研究与欣赏。",
  },
  {
    title: "禁止下载与传播",
    body: "本站不提供任何下载入口或下载链接。请勿将本站的播放地址用于下载、二次分发或任何商业行为；因个人行为产生的法律后果，本站不承担责任。",
  },
  {
    title: "服务可用性",
    body: "本功能依赖第三方接口，可能因接口变更、频率限制、网络等原因导致播放失败或中断，本站不对其持续可用性作出保证。",
  },
  {
    title: "侵权处理",
    body: "若版权方认为本站内容侵犯了您的合法权益，请通过下方联系方式告知，我们将在核实后第一时间移除相关内容。",
  },
  {
    title: "使用条款",
    body: "使用本站即表示您已阅读并同意本免责声明的全部内容。",
  },
]

export default async function MusicDisclaimerPage() {
  /*
   * 联系方式取自简历资料，而不是在页面里硬编码一份 ——
   * 邮箱或电话换了只需要改简历一处，避免出现第二个真相源。
   */
  const profile = await prisma.resumeProfile.findFirst({
    select: { email: true, phone: true },
  })
  const email = profile?.email?.trim() || ""
  const phone = profile?.phone?.trim() || ""

  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-4 py-12 pb-24">
          <BackLink fallbackHref="/music" className="mb-8" />

          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <ShieldAlert size={26} className="text-gray-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">免责声明</h1>
            <p className="mt-2 text-sm text-gray-500">
              适用于本站「清弦」音乐试听功能
            </p>
          </div>

          <ol className="space-y-6">
            {CLAUSES.map((clause, index) => (
              <li key={clause.title} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {clause.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">
                    {clause.body}
                  </p>
                  {clause.title === "侵权处理" && (
                    <p className="mt-2 text-sm text-gray-900">
                      {email && (
                        <>
                          邮箱：
                          <a
                            href={`mailto:${email}`}
                            className="text-accent underline"
                          >
                            {email}
                          </a>
                        </>
                      )}
                      {email && phone && <span className="mx-2 text-gray-300">·</span>}
                      {phone && <>电话：{phone}</>}
                      {!email && !phone && (
                        <span className="text-gray-400">
                          （简历资料里还没有填写联系方式）
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-12 border-t border-gray-100 pt-6 text-center text-xs leading-relaxed text-gray-400">
            本页面如与第三方接口提供方的条款冲突，以对方条款为准。
            若本站将来出现任何盈利行为，将立即停止使用该接口。
          </p>
        </div>
      </div>
    </ViewTransition>
  )
}
