import type { ResumeProfileData } from "@/lib/resume-helpers"

export default function ResumeFooter({
  profile,
}: {
  profile: ResumeProfileData | null
}) {
  if (!profile?.jobTarget && !profile?.jobSummary) {
    return null
  }

  return (
    <section className="py-12 px-4 bg-gray-50/50 border-t border-gray-100">
      <div className="max-w-5xl mx-auto text-center space-y-4">
        {profile.jobTarget && (
          <p className="text-lg text-gray-700 font-medium">
            求职意向：{profile.jobTarget}
          </p>
        )}
        {profile.jobSummary && (
          <p className="text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
            {profile.jobSummary}
          </p>
        )}
      </div>
    </section>
  )
}
