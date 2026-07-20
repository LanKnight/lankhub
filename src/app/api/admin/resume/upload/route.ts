import { NextRequest, NextResponse } from "next/server"
import { requireOwner } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { writeFile, unlink, mkdir } from "fs/promises"
import path from "path"

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

    // Delete old PDF if exists
    const existingProfile = await prisma.resumeProfile.findFirst()
    if (existingProfile?.resumePdf) {
      const oldPath = path.join(process.cwd(), "data", existingProfile.resumePdf)
      try { await unlink(oldPath) } catch { /* file may not exist */ }
    }

    // Save new PDF
    const filename = `resume-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    const uploadDir = path.join(process.cwd(), "data", "uploads")
    await mkdir(uploadDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
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

export async function DELETE(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const { filePath } = await req.json()
    if (filePath) {
      const fullPath = path.join(process.cwd(), "data", filePath)
      try { await unlink(fullPath) } catch { /* file may not exist */ }
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
