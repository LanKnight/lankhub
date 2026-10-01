import type { ResumeProfileData } from "@/lib/resume-helpers"
import DownloadMenu from "./DownloadMenu"

export default function ResumeHeader({
  profile,
  resumePdf,
}: {
  profile: ResumeProfileData | null
  resumePdf?: string | null
}) {
  return (
    <section className="resume-header-print py-16 px-4 bg-gradient-to-r from-brand-navy to-gray-800 text-white">
      <div className="max-w-5xl mx-auto text-center space-y-4">
        {/* 头像（可选） */}
        {profile?.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar}
            alt={profile.name || "头像"}
            className="no-print mx-auto w-28 h-28 rounded-full object-cover ring-4 ring-white/20"
          />
        )}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          {profile?.name || "未设置姓名"}
        </h1>
        <p className="text-xl text-brand-cyan font-medium">
          {profile?.title || "未设置职位"}
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-300 pt-2">
          <span>📧 {profile?.email || "未设置邮箱"}</span>
          <span>📱 {profile?.phone || "未设置电话"}</span>
          <span>📍 {profile?.location || "未设置所在地"}</span>
        </div>
        {/*
          下载入口。不再用 resumePdf 做门槛：完整版是实时从本页数据整理的，
          没有上传 PDF 时它也照常可用（菜单里只隐去「一页版」那一项）。
        */}
        {profile && (
          <div className="pt-4 no-print">
            <DownloadMenu hasPdf={Boolean(resumePdf)} />
          </div>
        )}
      </div>
    </section>
  )
}
