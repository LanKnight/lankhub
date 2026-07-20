import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"

export async function GET() {
  const authError = await requireOwner()
  if (authError) return authError

  const profile = await prisma.resumeProfile.findFirst({
    include: {
      skills: { orderBy: { sortOrder: "asc" } },
      experiences: { orderBy: { sortOrder: "asc" } },
    },
  })

  if (!profile) {
    return NextResponse.json({
      profile: null,
      skills: [],
      experiences: [],
    })
  }

  return NextResponse.json({
    profile,
    skills: profile.skills,
    experiences: profile.experiences,
  })
}

export async function PUT(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const body = await req.json()
    const { profile: profileData, skills, experiences } = body

    if (!profileData || !profileData.name) {
      return NextResponse.json(
        { error: "姓名为必填项" },
        { status: 400 }
      )
    }

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Find or create profile
      let profile = await tx.resumeProfile.findFirst()

      const profileFields = {
        name: profileData.name,
        title: profileData.title || "",
        email: profileData.email || "",
        phone: profileData.phone || "",
        location: profileData.location || "",
        avatar: profileData.avatar || null,
        birthDate: profileData.birthDate || "",
        birthplace: profileData.birthplace || "",
        degree: profileData.degree || "",
        political: profileData.political || "",
        selfEvaluation: profileData.selfEvaluation || "",
        jobTarget: profileData.jobTarget || "",
        jobSummary: profileData.jobSummary || "",
        hobbies: profileData.hobbies || "",
        resumePdf: profileData.resumePdf || null,
      }

      if (profile) {
        profile = await tx.resumeProfile.update({
          where: { id: profile.id },
          data: profileFields,
        })
      } else {
        profile = await tx.resumeProfile.create({
          data: profileFields,
        })
      }

      // Replace skills
      if (Array.isArray(skills)) {
        await tx.resumeSkill.deleteMany({ where: { profileId: profile.id } })
        if (skills.length > 0) {
          await tx.resumeSkill.createMany({
            data: skills.map((s: any, i: number) => ({
              name: s.name,
              level: s.level ?? 0,
              sortOrder: s.sortOrder ?? i,
              profileId: profile!.id,
            })),
          })
        }
      }

      // Replace experiences
      if (Array.isArray(experiences)) {
        await tx.resumeExperience.deleteMany({
          where: { profileId: profile.id },
        })
        if (experiences.length > 0) {
          await tx.resumeExperience.createMany({
            data: experiences.map((e: any, i: number) => ({
              type: e.type,
              title: e.title,
              subtitle: e.subtitle || null,
              startDate: e.startDate || null,
              endDate: e.endDate || null,
              description: e.description || null,
              techStack: e.techStack || null,
              sortOrder: e.sortOrder ?? i,
              profileId: profile!.id,
            })),
          })
        }
      }

      return profile
    })

    return NextResponse.json({ success: true, profileId: result.id })
  } catch (error) {
    console.error("Update resume error:", error)
    return NextResponse.json(
      { error: "更新简历失败" },
      { status: 500 }
    )
  }
}
