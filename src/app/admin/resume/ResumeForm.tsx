"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, Plus, Trash2, ChevronDown, ChevronUp, Upload } from "lucide-react"

interface SkillItem {
  name: string
  level: number
}

interface ExperienceItem {
  type: string
  title: string
  subtitle?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  techStack?: string | null
}

interface ProfileData {
  name: string
  title: string
  email: string
  phone: string
  location: string
  birthDate: string
  birthplace: string
  degree: string
  political: string
  selfEvaluation: string
  jobTarget: string
  jobSummary: string
  hobbies: string
  resumePdf: string
}

interface ResumeFormProps {
  initialData?: {
    profile: ProfileData | null
    skills: (SkillItem & { id?: number | null; sortOrder: number })[]
    experiences: (ExperienceItem & {
      id?: number | null
      sortOrder: number
    })[]
  }
}

type SectionKey =
  | "profile"
  | "personal"
  | "skills"
  | "certificates"
  | "selfEval"
  | "hobbies"
  | "education"
  | "campus"
  | "projects"
  | "practices"
  | "awards"
  | "footer"

const SECTION_LABELS: Record<SectionKey, string> = {
  profile: "基本信息",
  personal: "个人资料",
  skills: "专业技能",
  certificates: "证书",
  selfEval: "自我评价",
  hobbies: "兴趣爱好",
  education: "教育经历",
  campus: "校园经历",
  projects: "项目经历",
  practices: "实践经历",
  awards: "获奖荣誉",
  footer: "求职意向",
}

export default function ResumeForm({ initialData }: ResumeFormProps) {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData>({
    name: initialData?.profile?.name || "",
    title: initialData?.profile?.title || "",
    email: initialData?.profile?.email || "",
    phone: initialData?.profile?.phone || "",
    location: initialData?.profile?.location || "",
    birthDate: initialData?.profile?.birthDate || "",
    birthplace: initialData?.profile?.birthplace || "",
    degree: initialData?.profile?.degree || "",
    political: initialData?.profile?.political || "",
    selfEvaluation: initialData?.profile?.selfEvaluation || "",
    jobTarget: initialData?.profile?.jobTarget || "",
    jobSummary: initialData?.profile?.jobSummary || "",
    hobbies: initialData?.profile?.hobbies || "",
    resumePdf: initialData?.profile?.resumePdf || "",
  })

  const [skills, setSkills] = useState<SkillItem[]>(
    initialData?.skills?.length
      ? initialData.skills.map((s) => ({ name: s.name, level: s.level }))
      : []
  )

  const [certificates, setCertificates] = useState<ExperienceItem[]>(
    initialData?.experiences
      ?.filter((e) => e.type === "certificate")
      .map((e) => ({
        type: "certificate",
        title: e.title,
        subtitle: e.subtitle || "",
        startDate: e.startDate || "",
        endDate: e.endDate || "",
        description: e.description || "",
        techStack: e.techStack || "",
      })) || []
  )

  const expInit = (type: string) =>
    initialData?.experiences
      ?.filter((e) => e.type === type)
      .map((e) => ({
        type,
        title: e.title,
        subtitle: e.subtitle || "",
        startDate: e.startDate || "",
        endDate: e.endDate || "",
        description: e.description || "",
        techStack: e.techStack || "",
      })) || []

  const [education, setEducation] = useState<ExperienceItem[]>(expInit("education"))
  const [campus, setCampus] = useState<ExperienceItem[]>(expInit("campus"))
  const [projects, setProjects] = useState<ExperienceItem[]>(expInit("project"))
  const [practices, setPractices] = useState<ExperienceItem[]>(expInit("practice"))
  const [awards, setAwards] = useState<ExperienceItem[]>(expInit("award"))

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    profile: true,
    personal: false,
    skills: false,
    certificates: false,
    selfEval: false,
    hobbies: false,
    education: false,
    campus: false,
    projects: false,
    practices: false,
    awards: false,
    footer: false,
  })

  const toggle = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pdfFile, setPdfFile] = useState<string | null>(
    initialData?.profile?.resumePdf || null
  )

  const toggleSection = (section: SectionKey) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)

    if (!profile.name.trim()) {
      setError("请输入姓名")
      return
    }

    setLoading(true)

    const allExperiences = [
      ...certificates.map((item, i) => ({ ...item, type: "certificate", sortOrder: i })),
      ...education.map((item, i) => ({ ...item, type: "education", sortOrder: i })),
      ...campus.map((item, i) => ({ ...item, type: "campus", sortOrder: i })),
      ...projects.map((item, i) => ({ ...item, type: "project", sortOrder: i })),
      ...practices.map((item, i) => ({ ...item, type: "practice", sortOrder: i })),
      ...awards.map((item, i) => ({ ...item, type: "award", sortOrder: i })),
    ]

    try {
      const res = await fetch("/api/admin/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { ...profile, resumePdf: pdfFile },
          skills: skills.map((s, i) => ({
            name: s.name,
            level: s.level,
            sortOrder: i,
          })),
          experiences: allExperiences,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "保存失败")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
      router.refresh()
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      setError("仅支持 PDF 格式")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/admin/resume/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "上传失败")
        setUploading(false)
        return
      }

      const data = await res.json()
      setPdfFile(data.filePath)
      setUploading(false)
    } catch {
      setError("网络错误")
      setUploading(false)
    }
  }

  const handlePdfDelete = async () => {
    if (!pdfFile) return

    try {
      const res = await fetch("/api/admin/resume/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: pdfFile }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "删除失败")
        return
      }

      setPdfFile(null)
    } catch {
      setError("网络错误")
    }
  }

  const updateProfile = (field: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  const SectionHeader = ({
    section,
  }: {
    section: SectionKey
  }) => (
    <button
      type="button"
      onClick={() => toggle(section)}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
    >
      <span className="text-sm font-semibold text-gray-700">
        {SECTION_LABELS[section]}
      </span>
      {expanded[section] ? (
        <ChevronUp size={16} className="text-gray-400" />
      ) : (
        <ChevronDown size={16} className="text-gray-400" />
      )}
    </button>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          简历保存成功！
        </div>
      )}

      {/* Profile Section */}
      <SectionHeader section="profile" />
      {expanded.profile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white rounded-xl border border-gray-100">
          {[
            { key: "name", label: "姓名", placeholder: "张三" },
            { key: "title", label: "职位头衔", placeholder: "全栈开发工程师" },
            { key: "email", label: "邮箱", placeholder: "admin@example.com" },
            { key: "phone", label: "电话", placeholder: "138-xxxx-xxxx" },
            { key: "location", label: "所在地", placeholder: "中国 · 上海" },
          ].map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <input
                type="text"
                value={profile[f.key as keyof ProfileData]}
                onChange={(e) =>
                  updateProfile(f.key as keyof ProfileData, e.target.value)
                }
                placeholder={f.placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}

      {/* Personal Info */}
      <SectionHeader section="personal" />
      {expanded.personal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white rounded-xl border border-gray-100">
          {[
            { key: "birthDate", label: "出生日期", placeholder: "2000.01" },
            { key: "birthplace", label: "籍贯", placeholder: "浙江 · 杭州" },
            { key: "degree", label: "学历", placeholder: "本科" },
            { key: "political", label: "政治面貌", placeholder: "共青团员" },
          ].map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <input
                type="text"
                value={profile[f.key as keyof ProfileData]}
                onChange={(e) =>
                  updateProfile(f.key as keyof ProfileData, e.target.value)
                }
                placeholder={f.placeholder}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      <SectionHeader section="skills" />
      {expanded.skills && (
        <div className="p-4 bg-white rounded-xl border border-gray-100 space-y-3">
          {skills.map((skill, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="text"
                value={skill.name}
                onChange={(e) => {
                  const next = [...skills]
                  next[i] = { ...next[i], name: e.target.value }
                  setSkills(next)
                }}
                placeholder="技能名称"
                className={`${inputClass} flex-1`}
              />
              <div className="flex items-center gap-2 w-48">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={skill.level}
                  onChange={(e) => {
                    const next = [...skills]
                    next[i] = { ...next[i], level: parseInt(e.target.value) }
                    setSkills(next)
                  }}
                  className="flex-1"
                />
                <span className="text-xs text-gray-500 w-8 text-right">
                  {skill.level}%
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSkills([...skills, { name: "", level: 80 }])}
            className="flex items-center gap-1 text-sm text-accent hover:underline"
          >
            <Plus size={14} />
            添加技能
          </button>
        </div>
      )}

      {/* Certificates */}
      <SectionHeader section="certificates" />
      {expanded.certificates && (
        <DynamicList
          items={certificates}
          onChange={setCertificates}
          fields={[{ key: "title", label: "证书名称", placeholder: "CET-6" }]}
          emptyLabel="添加证书"
        />
      )}

      {/* Self Evaluation */}
      <SectionHeader section="selfEval" />
      {expanded.selfEval && (
        <div className="p-4 bg-white rounded-xl border border-gray-100">
          <textarea
            value={profile.selfEvaluation}
            onChange={(e) => updateProfile("selfEvaluation", e.target.value)}
            placeholder="简要的自我评价..."
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>
      )}

      {/* Hobbies */}
      <SectionHeader section="hobbies" />
      {expanded.hobbies && (
        <div className="p-4 bg-white rounded-xl border border-gray-100">
          <textarea
            value={profile.hobbies}
            onChange={(e) => updateProfile("hobbies", e.target.value)}
            placeholder="你的兴趣爱好，每行一个..."
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>
      )}

      {/* Education */}
      <SectionHeader section="education" />
      {expanded.education && (
        <DynamicList
          items={education}
          onChange={setEducation}
          fields={[
            { key: "title", label: "学校", placeholder: "XX大学" },
            { key: "subtitle", label: "专业", placeholder: "计算机科学与技术 · 本科" },
            { key: "startDate", label: "开始", placeholder: "2020" },
            { key: "endDate", label: "结束", placeholder: "2024" },
            { key: "description", label: "描述", placeholder: "补充描述（可选）" },
          ]}
          emptyLabel="添加教育经历"
          grid
          textareaKeys={["description"]}
        />
      )}

      {/* Campus */}
      <SectionHeader section="campus" />
      {expanded.campus && (
        <DynamicList
          items={campus}
          onChange={setCampus}
          fields={[
            { key: "title", label: "经历标题", placeholder: "学生会技术部部长" },
            { key: "startDate", label: "开始", placeholder: "2022" },
            { key: "endDate", label: "结束", placeholder: "2023" },
            { key: "description", label: "描述", placeholder: "工作内容..." },
          ]}
          emptyLabel="添加校园经历"
          textareaKeys={["description"]}
        />
      )}

      {/* Projects */}
      <SectionHeader section="projects" />
      {expanded.projects && (
        <DynamicList
          items={projects}
          onChange={setProjects}
          fields={[
            { key: "title", label: "项目名称", placeholder: "lankHub 个人博客" },
            { key: "startDate", label: "开始", placeholder: "2024" },
            { key: "endDate", label: "结束", placeholder: "至今" },
            { key: "description", label: "描述", placeholder: "项目介绍..." },
            { key: "techStack", label: "技术栈", placeholder: "Next.js, TypeScript, SQLite" },
          ]}
          emptyLabel="添加项目经历"
          textareaKeys={["description"]}
        />
      )}

      {/* Practices */}
      <SectionHeader section="practices" />
      {expanded.practices && (
        <DynamicList
          items={practices}
          onChange={setPractices}
          fields={[
            { key: "title", label: "公司/组织", placeholder: "XX科技有限公司" },
            { key: "subtitle", label: "职位", placeholder: "前端开发实习生" },
            { key: "startDate", label: "开始", placeholder: "2023.06" },
            { key: "endDate", label: "结束", placeholder: "2023.09" },
            { key: "description", label: "描述", placeholder: "工作内容..." },
          ]}
          emptyLabel="添加实践经历"
          textareaKeys={["description"]}
        />
      )}

      {/* Awards */}
      <SectionHeader section="awards" />
      {expanded.awards && (
        <DynamicList
          items={awards}
          onChange={setAwards}
          fields={[
            { key: "title", label: "奖项名称", placeholder: "ACM 程序设计竞赛一等奖" },
            { key: "startDate", label: "时间", placeholder: "2023" },
          ]}
          emptyLabel="添加获奖荣誉"
        />
      )}

      {/* Job Target */}
      <SectionHeader section="footer" />
      {expanded.footer && (
        <div className="p-4 bg-white rounded-xl border border-gray-100 space-y-4">
          <div>
            <label className={labelClass}>求职意向</label>
            <input
              type="text"
              value={profile.jobTarget}
              onChange={(e) => updateProfile("jobTarget", e.target.value)}
              placeholder="全栈开发工程师 / 前端开发工程师"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>期望描述</label>
            <textarea
              value={profile.jobSummary}
              onChange={(e) => updateProfile("jobSummary", e.target.value)}
              placeholder="期望能在一个有挑战性的团队中持续成长..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>
      )}

      {/* PDF Resume Upload */}
      <div className="p-4 bg-white rounded-xl border border-gray-100 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">完整简历下载</h3>
        {pdfFile ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">已上传简历文件</span>
            <button
              type="button"
              onClick={handlePdfDelete}
              className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              删除
            </button>
          </div>
        ) : (
          <div>
            <label className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-accent transition-colors text-sm text-gray-500">
              <Upload size={16} />
              {uploading ? "上传中..." : "选择 PDF 文件上传"}
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-100 sticky bottom-0 bg-gray-50/95 py-4 -mx-1 px-1">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {loading ? "保存中..." : "保存简历"}
        </button>
      </div>
    </form>
  )
}

// Reusable dynamic list component
function DynamicList({
  items,
  onChange,
  fields,
  emptyLabel,
  grid,
  textareaKeys,
}: {
  items: ExperienceItem[]
  onChange: (items: ExperienceItem[]) => void
  fields: { key: string; label: string; placeholder: string }[]
  emptyLabel: string
  grid?: boolean
  textareaKeys?: string[]
}) {
  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"

  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100 space-y-4">
      {items.map((item, i) => (
        <div key={i} className="p-3 border border-gray-100 rounded-lg space-y-3 relative">
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <div className={grid ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3"}>
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">
                  {f.label}
                </label>
                {textareaKeys?.includes(f.key) ? (
                  <textarea
                    value={(item as any)[f.key] || ""}
                    onChange={(e) => {
                      const next = [...items]
                      next[i] = { ...next[i], [f.key]: e.target.value }
                      onChange(next)
                    }}
                    placeholder={f.placeholder}
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                ) : (
                  <input
                    type="text"
                    value={(item as any)[f.key] || ""}
                    onChange={(e) => {
                      const next = [...items]
                      next[i] = { ...next[i], [f.key]: e.target.value }
                      onChange(next)
                    }}
                    placeholder={f.placeholder}
                    className={inputClass}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">暂无数据</p>
      )}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            Object.fromEntries(fields.map((f) => [f.key, ""])) as unknown as ExperienceItem,
          ])
        }
        className="flex items-center gap-1 text-sm text-accent hover:underline"
      >
        <Plus size={14} />
        {emptyLabel}
      </button>
    </div>
  )
}
