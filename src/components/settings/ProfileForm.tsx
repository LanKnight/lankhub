"use client"

import { useState } from "react"
import { Loader2, Save } from "lucide-react"
import { updateProfileAction } from "@/lib/auth-actions"

/** 与服务端 ProfileUpdateSchema 保持一致，仅用于少一次往返 */
const NAME_MAX = 20
const BIO_MAX = 200

export default function ProfileForm({
  initialName,
  initialBio,
}: {
  initialName: string
  initialBio: string
}) {
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    // 客户端先挡一道，服务端仍会再校验一遍（不能只靠前端）
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("请填写昵称")
      return
    }
    if (trimmedName.length > NAME_MAX) {
      setError(`昵称不能超过 ${NAME_MAX} 个字`)
      return
    }
    const trimmedBio = bio.trim()
    if (trimmedBio.length > BIO_MAX) {
      setError(`个人简介不能超过 ${BIO_MAX} 字`)
      return
    }

    setLoading(true)
    try {
      const result = await updateProfileAction(trimmedName, trimmedBio)
      if (!result.success) {
        setError(result.error || "保存失败")
        return
      }
      setSuccess("已保存")
    } catch {
      setError("保存失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm">
          {success}
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          昵称
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={NAME_MAX}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">
          全站唯一，最多 {NAME_MAX} 个字
        </p>
      </div>

      <div>
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          个人简介
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          placeholder="一句话介绍自己（可选）"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all text-sm resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">
          {bio.trim().length} / {BIO_MAX}
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {loading ? "保存中..." : "保存资料"}
      </button>
    </form>
  )
}
