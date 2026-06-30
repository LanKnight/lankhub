import { prisma } from "@/lib/prisma"

export interface ResumeSkillData {
  id?: number | null
  name: string
  level: number
  sortOrder: number
}

export interface ResumeExperienceData {
  id?: number | null
  type: string
  title: string
  subtitle?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  techStack?: string | null
  sortOrder: number
}

export interface ResumeProfileData {
  id?: number
  name: string
  title: string
  email: string
  phone: string
  location: string
  avatar?: string | null
  birthDate: string
  birthplace: string
  degree: string
  political: string
  selfEvaluation: string
  jobTarget: string
  jobSummary: string
}

export interface ResumeFullData {
  profile: ResumeProfileData | null
  skills: ResumeSkillData[]
  experiences: ResumeExperienceData[]
}

export async function getResumeData(): Promise<ResumeFullData> {
  const profile = await prisma.resumeProfile.findFirst({
    include: {
      skills: { orderBy: { sortOrder: "asc" } },
      experiences: { orderBy: { sortOrder: "asc" } },
    },
  })

  if (!profile) {
    return {
      profile: null,
      skills: [],
      experiences: [],
    }
  }

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      title: profile.title,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      avatar: profile.avatar,
      birthDate: profile.birthDate,
      birthplace: profile.birthplace,
      degree: profile.degree,
      political: profile.political,
      selfEvaluation: profile.selfEvaluation,
      jobTarget: profile.jobTarget,
      jobSummary: profile.jobSummary,
    },
    skills: profile.skills.map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      sortOrder: s.sortOrder,
    })),
    experiences: profile.experiences.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      subtitle: e.subtitle,
      startDate: e.startDate,
      endDate: e.endDate,
      description: e.description,
      techStack: e.techStack,
      sortOrder: e.sortOrder,
    })),
  }
}
