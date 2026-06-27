import {
  Gamepad2,
  Code2,
  Dumbbell,
  Headphones,
  Coffee,
  Camera,
} from "lucide-react"

const hobbies = [
  { icon: Code2, label: "编程", color: "text-blue-500" },
  { icon: Gamepad2, label: "游戏", color: "text-purple-500" },
  { icon: Dumbbell, label: "运动", color: "text-green-500" },
  { icon: Headphones, label: "音乐", color: "text-pink-500" },
  { icon: Camera, label: "摄影", color: "text-orange-500" },
  { icon: Coffee, label: "咖啡", color: "text-amber-600" },
]

export default function HobbiesSection() {
  return (
    <section className="py-24 px-4 bg-gray-50/50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">兴趣爱好</h2>
          <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {hobbies.map((hobby) => (
            <div
              key={hobby.label}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <hobby.icon
                size={32}
                className={`${hobby.color} group-hover:scale-110 transition-transform`}
              />
              <span className="text-sm font-medium text-gray-600">
                {hobby.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
