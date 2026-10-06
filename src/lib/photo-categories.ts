import {
  Code2,
  Gamepad2,
  Dumbbell,
  Camera,
  Coffee,
  type LucideIcon,
} from "lucide-react"

/**
 * 相册分类。
 *
 * 原先还有一个 slug 为 music 的「清弦」—— 因为音乐类的照片太少，
 * 那一栏已经改造成歌单页（/music），不再属于相册，所以从这里移除了。
 */
export const PHOTO_CATEGORIES = [
  {
    slug: "programming",
    label: "码砚",
    color: "text-blue-500",
    description: "写代码的那些时刻",
  },
  {
    slug: "gaming",
    label: "弈趣",
    color: "text-purple-500",
    description: "游戏时光",
  },
  {
    slug: "sports",
    label: "驰野",
    color: "text-green-500",
    description: "运动日常",
  },
  {
    slug: "photography",
    label: "捕光",
    color: "text-orange-500",
    description: "镜头下的世界",
  },
  {
    slug: "coffee",
    label: "闲酌",
    color: "text-amber-600",
    description: "咖啡生活",
  },
] as const

export type PhotoCategorySlug = (typeof PHOTO_CATEGORIES)[number]["slug"]

export function getPhotoCategory(slug: string) {
  return PHOTO_CATEGORIES.find((c) => c.slug === slug)
}

export function isValidPhotoCategory(slug: string): slug is PhotoCategorySlug {
  return PHOTO_CATEGORIES.some((c) => c.slug === slug)
}

export const HOBBY_ICONS: Record<PhotoCategorySlug, LucideIcon> = {
  programming: Code2,
  gaming: Gamepad2,
  sports: Dumbbell,
  photography: Camera,
  coffee: Coffee,
}
