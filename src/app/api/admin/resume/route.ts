import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireOwner } from "@/lib/auth-helpers"
import { ResumeSaveSchema } from "@/lib/validations"

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
    /*
     * 校验交给 ResumeSaveSchema —— 它的字段清单与下面用到的完全对齐。
     * 这一点必须小心：zod 会静默剥掉未知字段，原来那个 ResumeProfileSchema
     * 只覆盖了 15 个字段里的 11 个（漏 avatar / hobbies / resumePdf），
     * 直接套上去会把这三项默默丢掉。
     */
    const parsed = ResumeSaveSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "请检查填写内容" },
        { status: 400 }
      )
    }
    const { profile: profileData, skills, experiences } = parsed.data

    // 安全校验：resumePdf 必须是合法路径格式（防止路径穿越写入，移到 transaction 外避免 TS 类型问题）
    const resumePdf = profileData.resumePdf || null
    if (resumePdf) {
      const safePattern = /^\/uploads\/resume-[A-Za-z0-9-]+\.pdf$/
      if (!safePattern.test(resumePdf)) {
        return NextResponse.json(
          { error: "简历文件路径无效" },
          { status: 400 }
        )
      }
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
        resumePdf,
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
            data: skills.map((s, i) => ({
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
            data: experiences.map((e, i) => ({
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

    // 保存成功后立即刷新简历页的 ISR 缓存
    revalidatePath("/resume")
    return NextResponse.json({ success: true, profileId: result.id })
  } catch (error) {
    console.error("Update resume error:", error)
    return NextResponse.json(
      { error: "更新简历失败" },
      { status: 500 }
    )
  }
}
