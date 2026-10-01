import type { Metadata } from "next"
import { getResumeData } from "@/lib/resume-helpers"
import ResumePrintDocument from "@/components/resume/ResumePrintDocument"
import PrintTrigger from "@/components/resume/PrintTrigger"

// 与 /resume 保持一致：低频更新，60s 缓存
export const revalidate = 60

export const metadata: Metadata = {
  title: "完整版简历",
  // 打印视图不该被搜索引擎当成正文页收录
  robots: { index: false, follow: false },
}

/**
 * 完整版简历的打印视图。
 *
 * 不生成 PDF 文件、不做任何预打包：中文字体由浏览器/系统渲染，
 * 排版全部交给 CSS，分页交给打印引擎 —— 因此没有任何生成或缓存的性能开销。
 * 用户从这里「另存为 PDF」拿到的就是矢量、可选中、可搜索的 PDF。
 */
export default async function ResumePrintPage() {
  const data = await getResumeData()

  return (
    <div className="min-h-screen bg-gray-100/60 py-8 print:bg-white print:py-0">
      <PrintTrigger />
      <div className="mx-auto w-full shadow-sm print:shadow-none">
        <ResumePrintDocument {...data} />
      </div>
    </div>
  )
}
