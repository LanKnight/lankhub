import type { ResumeExperienceData } from "@/lib/resume-helpers"

export default function RightColumn({
  experiences,
}: {
  experiences: ResumeExperienceData[]
}) {
  const education = experiences.filter((e) => e.type === "education")
  const campus = experiences.filter((e) => e.type === "campus")
  const projects = experiences.filter((e) => e.type === "project")
  const practices = experiences.filter((e) => e.type === "practice")
  const awards = experiences.filter((e) => e.type === "award")

  return (
    <div className="lg:col-span-2 space-y-10">
      {/* Education */}
      {education.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            教育经历
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            {education.map((edu) => (
              <div key={edu.id ?? edu.title} className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">{edu.title}</h4>
                  {edu.subtitle && (
                    <p className="text-sm text-gray-500 mt-0.5">{edu.subtitle}</p>
                  )}
                  {edu.description && (
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                      {edu.description}
                    </p>
                  )}
                </div>
                {(edu.startDate || edu.endDate) && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {edu.startDate} {edu.endDate ? `- ${edu.endDate}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Campus Experience */}
      {campus.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            校园经历
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            {campus.map((item) => (
              <TimelineItem
                key={item.id ?? item.title}
                title={item.title}
                date={formatDateRange(item.startDate, item.endDate)}
                description={item.description || ""}
              />
            ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            项目经历
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            {projects.map((item) => (
              <TimelineItem
                key={item.id ?? item.title}
                title={item.title}
                date={formatDateRange(item.startDate, item.endDate)}
                description={item.description || ""}
                tech={item.techStack || undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* Practices */}
      {practices.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            实践经历
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            {practices.map((item) => (
              <div key={item.id ?? item.title} className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">{item.title}</h4>
                  {item.subtitle && (
                    <p className="text-sm text-gray-500 mt-0.5">{item.subtitle}</p>
                  )}
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
                {(item.startDate || item.endDate) && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {formatDateRange(item.startDate, item.endDate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Awards */}
      {awards.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            获奖荣誉
          </h3>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 text-sm text-gray-600">
            {awards.map((item) => (
              <p key={item.id ?? item.title}>• {item.title}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return ""
  if (start && end) return `${start} - ${end}`
  return start || end || ""
}

function TimelineItem({
  title,
  date,
  description,
  tech,
}: {
  title: string
  date: string
  description: string
  tech?: string
}) {
  return (
    <div className="relative pl-4 border-l-2 border-gray-100">
      <div className="flex justify-between items-start">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {date && (
          <span className="text-xs text-gray-400 whitespace-nowrap">{date}</span>
        )}
      </div>
      {description && (
        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{description}</p>
      )}
      {tech && (
        <p className="text-xs text-gray-400 mt-1.5 font-mono">{tech}</p>
      )}
    </div>
  )
}
