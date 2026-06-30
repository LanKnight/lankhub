import type { ResumeProfileData } from "@/lib/resume-helpers"

export default function ResumeHeader({
  profile,
}: {
  profile: ResumeProfileData | null
}) {
  return (
    <section className="py-16 px-4 bg-gradient-to-r from-brand-navy to-gray-800 text-white">
      <div className="max-w-5xl mx-auto text-center space-y-4">
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
      </div>
    </section>
  )
}
