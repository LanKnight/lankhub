import type {
  ResumeExperienceData,
  ResumeFullData,
} from "@/lib/resume-helpers"
import AutoLink from "@/components/ui/AutoLink"

/**
 * 完整版简历的单栏 A4 排版。
 *
 * 与网页版 `/resume` 的差异（不是同一套 CSS 复用，是刻意的）：
 * - 单栏，去掉卡片边框与底色，改用「小标题 + 细分隔线」分区 —— A4 上更好读
 * - 专业技能只列名称，**不带百分比与进度条**（网页版保留 SkillBar 不动）
 * - 分页控制收窄到「条目」级：区块之间允许分页，条目内部不允许断开
 */
export default function ResumePrintDocument({
  profile,
  skills,
  experiences,
}: ResumeFullData) {
  if (!profile) {
    return (
      <p className="py-16 text-center text-sm text-gray-400">
        暂无简历内容
      </p>
    )
  }

  const pick = (type: string) => experiences.filter((e) => e.type === type)

  const education = pick("education")
  const projects = pick("project")
  const practices = pick("practice")
  const campus = pick("campus")
  const certificates = pick("certificate")

  // 基本情况：有值才拼，避免出现「学历：」这种空标签
  const basics = [
    profile.birthDate && `出生年月：${profile.birthDate}`,
    profile.birthplace && `籍贯：${profile.birthplace}`,
    profile.degree && `学历：${profile.degree}`,
    profile.political && `政治面貌：${profile.political}`,
  ].filter(Boolean) as string[]

  const contacts = [profile.email, profile.phone, profile.location].filter(Boolean)

  return (
    <article className="resume-print">
      {/* 头部：姓名 + 职位 + 联系方式 + 基本情况 */}
      <header className="print-header">
        {profile.avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar} alt="" className="print-avatar" />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
          {profile.title && (
            <p className="text-sm text-gray-600 mt-0.5">{profile.title}</p>
          )}
          {contacts.length > 0 && (
            <p className="text-xs text-gray-500 mt-1.5 break-all">
              {contacts.join("　·　")}
            </p>
          )}
          {basics.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {basics.join("　｜　")}
            </p>
          )}
        </div>
      </header>

      {(profile.jobTarget || profile.jobSummary) && (
        <Section title="求职意向">
          {profile.jobTarget && (
            <p className="text-sm font-medium">{profile.jobTarget}</p>
          )}
          {profile.jobSummary && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mt-1">
              <AutoLink text={profile.jobSummary} />
            </p>
          )}
        </Section>
      )}

      {skills.length > 0 && (
        <Section title="专业技能">
          {/* 只列名称：简历里打百分比既不客观也不好看 */}
          <p className="text-sm leading-relaxed">
            {skills.map((s) => s.name).join("　·　")}
          </p>
        </Section>
      )}

      {education.length > 0 && (
        <Section title="教育经历">
          {education.map((item) => (
            <Entry key={item.id ?? item.title} item={item} />
          ))}
        </Section>
      )}

      {projects.length > 0 && (
        <Section title="项目经历">
          {projects.map((item) => (
            <Entry key={item.id ?? item.title} item={item} showTech />
          ))}
        </Section>
      )}

      {practices.length > 0 && (
        <Section title="实践经历">
          {practices.map((item) => (
            <Entry key={item.id ?? item.title} item={item} showTech />
          ))}
        </Section>
      )}

      {campus.length > 0 && (
        <Section title="校园经历">
          {campus.map((item) => (
            <Entry key={item.id ?? item.title} item={item} />
          ))}
        </Section>
      )}

      {certificates.length > 0 && (
        <Section title="证书">
          <ul className="text-sm leading-relaxed space-y-0.5">
            {certificates.map((item) => (
              <li key={item.id ?? item.title}>· {item.title}</li>
            ))}
          </ul>
        </Section>
      )}

      {profile.selfEvaluation && (
        <Section title="自我评价">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            <AutoLink text={profile.selfEvaluation} />
          </p>
        </Section>
      )}

      {profile.hobbies && (
        <Section title="兴趣爱好">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            <AutoLink text={profile.hobbies} />
          </p>
        </Section>
      )}
    </article>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="print-section">
      <h2 className="print-heading">{title}</h2>
      {children}
    </section>
  )
}

function Entry({
  item,
  showTech = false,
}: {
  item: ResumeExperienceData
  showTech?: boolean
}) {
  const date = [item.startDate, item.endDate].filter(Boolean).join(" - ")

  return (
    <div className="print-item">
      <div className="flex justify-between items-baseline gap-3">
        <h3 className="text-sm font-semibold min-w-0">{item.title}</h3>
        {date && (
          <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
            {date}
          </span>
        )}
      </div>
      {item.subtitle && (
        <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
      )}
      {item.description && (
        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mt-1">
          <AutoLink text={item.description} />
        </p>
      )}
      {showTech && item.techStack && (
        <p className="text-xs text-gray-500 mt-1">
          <AutoLink text={item.techStack} />
        </p>
      )}
    </div>
  )
}
