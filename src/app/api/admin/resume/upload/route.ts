import { NextRequest, NextResponse } from "next/server"
import { requireOwner } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { writeFile, unlink, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { isPdf } from "@/lib/file-type"

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的文件" },
        { status: 400 }
      )
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "仅支持 PDF 格式" },
        { status: 400 }
      )
    }

    // 文件大小限制 10MB
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "PDF 大小不能超过 10MB" },
        { status: 400 }
      )
    }

    // 读取文件内容并进行 magic byte 校验
    const buffer = Buffer.from(await file.arrayBuffer())
    if (!isPdf(buffer)) {
      return NextResponse.json(
        { error: "文件内容不是有效的 PDF 格式" },
        { status: 400 }
      )
    }

    // Delete old PDF if exists (先读后删，不在 DELETE 中信任客户端路径)
    const existingProfile = await prisma.resumeProfile.findFirst()
    if (existingProfile?.resumePdf) {
      const oldPath = path.join(process.cwd(), "data", existingProfile.resumePdf)
      try { await unlink(oldPath) } catch { /* file may not exist */ }
    }

    // Save new PDF（使用 crypto UUID 代替 Math.random）
    const filename = `resume-${crypto.randomUUID()}.pdf`
    const uploadDir = path.join(process.cwd(), "data", "uploads")
    await mkdir(uploadDir, { recursive: true })

    const filePath = path.join(uploadDir, filename)
    await writeFile(filePath, buffer)

    const relativePath = `/uploads/${filename}`

    // Update profile
    if (existingProfile) {
      await prisma.resumeProfile.update({
        where: { id: existingProfile.id },
        data: { resumePdf: relativePath },
      })
    } else {
      await prisma.resumeProfile.create({
        data: { resumePdf: relativePath },
      })
    }

    return NextResponse.json(
      { filePath: relativePath },
      { status: 201 }
    )
  } catch (error) {
    console.error("PDF upload error:", error)
    return NextResponse.json(
      { error: "上传失败，请稍后重试" },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    // 从数据库获取当前 PDF 路径，不信任客户端传入的 filePath
    const profile = await prisma.resumeProfile.findFirst()
    if (profile?.resumePdf) {
      // 安全校验：仅允许 /uploads/resume-{id}.pdf 格式的路径
      const safePattern = /^\/uploads\/resume-[A-Za-z0-9-]+\.pdf$/
      if (safePattern.test(profile.resumePdf)) {
        const fullPath = path.join(process.cwd(), "data", profile.resumePdf)
        try { await unlink(fullPath) } catch { /* file may not exist */ }
      }
    }

    await prisma.resumeProfile.updateMany({
      data: { resumePdf: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("PDF delete error:", error)
    return NextResponse.json(
      { error: "删除失败" },
      { status: 500 }
    )
  }
}
