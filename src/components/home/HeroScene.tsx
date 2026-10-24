import type { CSSProperties } from "react"

import {
  HERO_BIRDS,
  HERO_SCENE_ASSETS,
  HERO_SNOW_FLAKES,
  MOBILE_MEDIA,
  type HeroSceneName,
} from "./hero-scene"

/**
 * 一层场景：底图 + 夜色（仅江湖态）+ 动态层 + 文字底衬。
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
        夜色：暮色压暗（multiply）+ 右上角月晕（screen）。
        素材本身是浅色纸本，夜色是**叠出来**的，不改原图。
      */}
      {scene === "jianghu" && (
        <>
          <div className="hero-night hero-night-dusk" />
          <div className="hero-night hero-night-moon" />
        </>
      )}

      {/*
        动态层：全部在「文字底衬」与文字**之下**，保证可读性。
        每层都是绝对定位、只动 transform/opacity，走合成器。
        动画是否运行由 CSS 决定（场景态、reduced-motion、data-hero-motion）。
      */}
      <div className="hero-fx">
        {scene === "snow" && (
          <>
            {/* 远层：平铺的雪点纹理，零 DOM 节点 */}
            <div className="hero-fx-snow-far" />
            {/* 近层：带大小/模糊差异的雪点，更像真的雪 */}
            <div className="hero-fx-snow-near">
              {HERO_SNOW_FLAKES.map((flake, index) => (
                <span
                  key={index}
                  className="hero-flake"
                  style={
                    {
                      "--flake-x": `${flake.x}%`,
                      "--flake-size": `${flake.size}px`,
                      "--flake-dur": `${flake.dur}s`,
                      "--flake-delay": `${flake.delay}s`,
                      "--flake-opacity": flake.opacity,
                      "--flake-drift": `${flake.drift}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </>
        )}

        {scene === "jianghu" && (
          <>
            {/* 酒旗旁的一点暖光：很慢的明暗，不闪成霓虹 */}
            <div className="hero-fx-lamp" />

            {/* 归鸟：三只，深浅不同，慢速横穿 */}
            <div className="hero-fx-birds">
              {HERO_BIRDS.map((bird, index) => (
                <span
                  key={index}
                  className="hero-bird"
                  style={
                    {
                      "--bird-top": `${bird.top}%`,
                      "--bird-dur": `${bird.dur}s`,
                      "--bird-delay": `${bird.delay}s`,
                      "--bird-scale": bird.scale,
                      "--bird-opacity": bird.opacity,
                    } as CSSProperties
                  }
                >
                  {/* 一笔带过的雁形：只描边不填充，放大也不会露馅 */}
                  <svg viewBox="0 0 24 8" fill="none" aria-hidden="true">
                    <path
                      d="M1 6.2C5 2.4 8.4 1.6 12 4.6c3.6-3 7-2.2 11 1.6"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 文字底衬：手机上文字会压在主体上，需要一层场景色的薄雾 */}
      <div className="hero-scrim" data-scene={scene} />
    </div>
  )
}
