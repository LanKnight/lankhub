"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Trash2, Loader2, ShieldCheck, User as UserIcon } from "lucide-react"
import { useToast } from "@/components/ui/Toast"
import { formatDate } from "@/lib/utils"
import { PERMISSIONS } from "@/lib/permissions"

interface Account {
  id: number
  email: string
  name: string
  role: string
  permissions: string | null
  createdAt: string
  _count: {
    comments: number
    articles: number
    photos: number
    poems: number
  }
}

// 权限码与中文标签都取自唯一真相源，不在这里另抄一份
const PERM_OPTIONS = PERMISSIONS

export default function UserManager({ initialUsers }: { initialUsers: Account[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const { data: session } = useSession()
  // session.user 的扩展字段由 src/types/next-auth.d.ts 声明，这里不再需要断言
  const myId = parseInt(session?.user?.id || "0")

  const [users, setUsers] = useState<Account[]>(initialUsers)
  const [error, setError] = useState("")
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const togglePerm = async (user: Account, code: string, checked: boolean) => {
    if (updatingId) return
    setUpdatingId(user.id)
    setError("")
    try {
      const perms = new Set(
        (user.permissions || "").split(",").filter(Boolean)
      )
      if (checked) perms.add(code)
      else perms.delete(code)

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...perms] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "更新失败")
        setUpdatingId(null)
        return
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, permissions: data.permissions || null }
            : u
        )
      )
      toast(checked ? `已授予「${code}」权限` : `已收回「${code}」权限`, "success")
      router.refresh()
    } catch {
      setError("网络错误")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (user: Account) => {
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "删除失败")
        setDeletingId(null)
        setDeleting(false)
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setDeletingId(null)
      toast("账号已删除（其评论/照片/诗词保留为匿名）", "success")
      router.refresh()
    } catch {
      setError("网络错误")
      setDeletingId(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 hover:underline">
            关闭
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 text-sm text-gray-500">
        <p>
          <ShieldCheck size={14} className="inline mr-1 text-green-600" />
          勾选权限可授予读者对应功能（文章/相册/拾章），授权读者只能操作自己创建的内容；站长保留全部权限。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-5 py-3 font-medium">账号</th>
              <th className="text-left px-5 py-3 font-medium">角色</th>
              <th className="text-left px-5 py-3 font-medium">注册时间</th>
              <th className="text-left px-5 py-3 font-medium">内容量</th>
              <th className="text-left px-5 py-3 font-medium">权限（站长专属）</th>
              <th className="text-right px-5 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => {
              const isMe = user.id === myId
              const isOwner = user.role === "OWNER"
              const perms = new Set((user.permissions || "").split(",").filter(Boolean))
              return (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-800 font-medium">{user.name}</span>
                      {isMe && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                          当前账号
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isOwner
                          ? "bg-amber-50 text-amber-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {isOwner ? "站长" : "读者"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    <span title="文章/评论/照片/诗词">
                      文 {user._count.articles} · 评 {user._count.comments} · 图{" "}
                      {user._count.photos} · 诗 {user._count.poems}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {isOwner ? (
                      <span className="text-xs text-gray-400">全部权限</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {PERM_OPTIONS.map((opt) => {
                          const checked = perms.has(opt.code)
                          const disabled = updatingId !== null
                          return (
                            <label
                              key={opt.code}
                              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border cursor-pointer transition-colors ${
                                checked
                                  ? "border-accent/40 bg-accent/5 text-gray-700"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              } ${disabled ? "opacity-50" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={(e) =>
                                  togglePerm(user, opt.code, e.target.checked)
                                }
                                className="accent-gray-900"
                              />
                              {opt.label}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      {isOwner || isMe ? (
                        <span className="text-xs text-gray-300" title="站长/当前账号不可删除">
                          <UserIcon size={14} className="inline" /> 不可删除
                        </span>
                      ) : deletingId === user.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={deleting}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              "确认删除"
                            )}
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(user.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="删除账号"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        删除账号后，其发表的评论/照片/诗词会保留并显示为匿名。
      </p>
    </div>
  )
}
