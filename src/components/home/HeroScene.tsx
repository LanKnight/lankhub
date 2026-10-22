import { HERO_SCENE_ASSETS, MOBILE_MEDIA, type HeroSceneName } from "./hero-scene"

/**
 * 一层场景：底图 + 夜色（仅江湖态）+ 文字底衬。
 *
 * 纯展示，不含任何状态逻辑 —— 显隐完全由 globals.css 里
 * `:root[data-hero-scene="…"]` 决定，本组件两态都渲染、叠着放。
 *
 * 为什么两层都在 DOM 里而不是换 <img src>：
 * 换 src 会有一帧空白（新图还没解码完），交叉淡入天然平滑；
 * 两张图合计约 185KB，也在预算内。
 */
export default function HeroScene({ scene }: { scene: HeroSceneName }) {
  const asset = HERO_SCENE_ASSETS[scene]

  return (
    <div className="hero-scene" data-scene={scene} aria-hidden="true">
      <div className="hero-scene-media">
        {/*
          用原生 <picture> 而不是 next/image：
          竖版是**另一种裁切**（不是缩放），只有 <picture> 的 media 能表达；
          图已按档位压好（WebP q82），也不需要 /_next/image 再转一次。
        */}
        <picture>
          <source media={MOBILE_MEDIA} srcSet={asset.mobile} />
          <img
            src={asset.desktop}
            alt=""
            decoding="async"
            fetchPriority={scene === "snow" ? "high" : "low"}
            style={{ objectPosition: asset.objectPosition }}
          />
        </picture>
      </div>

      {/*
        夜色层全部渲染，用 :root[data-hero-night="…"] 决定显示哪一套。
        这样切换对比只改一个属性，不用重新构建。
      */}
      {scene === "jianghu" && (
        <>
          <div className="hero-night hero-night-dusk" />
          <div className="hero-night hero-night-moon" />
          <div className="hero-night hero-night-duotone-dark" />
          <div className="hero-night hero-night-duotone-light" />
        </>
      )}

      {/* 文字底衬：手机上文字会压在主体上，需要一层场景色的薄雾 */}
      <div className="hero-scrim" data-scene={scene} />
    </div>
  )
}
