import type { ResumeProfileData, ResumeSkillData, ResumeExperienceData } from "@/lib/resume-helpers"

interface LeftColumnProps {
  profile: ResumeProfileData | null
  skills: ResumeSkillData[]
  experiences: ResumeExperienceData[]
}

export default function LeftColumn({ profile, skills, experiences }: LeftColumnProps) {
  const certificates = experiences.filter((e) => e.type === "certificate")

  return (
    <div className="lg:col-span-1 space-y-8">
      {/* Personal Info */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          基本信息
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
          {profile?.birthDate ? (
            <p><span className="font-medium text-gray-800">出生年月：</span>{profile.birthDate}</p>
          ) : null}
          {profile?.birthplace ? (
            <p><span className="font-medium text-gray-800">籍贯：</span>{profile.birthplace}</p>
          ) : null}
          {profile?.degree ? (
            <p><span className="font-medium text-gray-800">学历：</span>{profile.degree}</p>
          ) : null}
          {profile?.political ? (
            <p><span className="font-medium text-gray-800">政治面貌：</span>{profile.political}</p>
          ) : null}
          {!profile?.birthDate && !profile?.birthplace && !profile?.degree && !profile?.political && (
            <p className="text-gray-400">暂无信息</p>
          )}
        </div>
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          专业技能
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          {skills.length > 0 ? (
            skills.map((skill) => (
              <div key={skill.id ?? skill.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{skill.name}</span>
                  <span className="text-gray-400 text-xs">{skill.level}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-brand-cyan rounded-full transition-all"
                    style={{ width: `${skill.level}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400">暂无技能信息</p>
          )}
        </div>
      </section>

      {/* Certificates */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          证书
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
          {certificates.length > 0 ? (
            certificates.map((cert) => (
              <p key={cert.id ?? cert.title}>• {cert.title}</p>
            ))
          ) : (
            <p className="text-gray-400">暂无证书信息</p>
          )}
        </div>
      </section>

      {/* Self Evaluation */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          自我评价
        </h3>
        <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
          {profile?.selfEvaluation || "暂无自我评价"}
        </div>
      </section>

      {/* Hobbies */}
      {profile?.hobbies ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            兴趣爱好
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {profile.hobbies}
          </div>
        </section>
      ) : null}
    </div>
  )
}
