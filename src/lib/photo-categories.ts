import {
  Code2,
  Gamepad2,
  Dumbbell,
  Headphones,
  Camera,
  Coffee,
  type LucideIcon,
} from "lucide-react"

export const PHOTO_CATEGORIES = [
  {
    slug: "programming",
    label: "编程",
    color: "text-blue-500",
    description: "写代码的那些时刻",
  },
  {
    slug: "gaming",
    label: "游戏",
    color: "text-purple-500",
    description: "游戏时光",
  },
  {
    slug: "sports",
    label: "运动",
    color: "text-green-500",
    description: "运动日常",
  },
  {
    slug: "music",
    label: "音乐",
    color: "text-pink-500",
    description: "音乐瞬间",
  },
  {
    slug: "photography",
    label: "摄影",
    color: "text-orange-500",
    description: "镜头下的世界",
  },
  {
    slug: "coffee",
    label: "咖啡",
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
  music: Headphones,
  photography: Camera,
  coffee: Coffee,
}
