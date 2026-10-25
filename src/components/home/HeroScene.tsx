import type { CSSProperties } from "react"

import {
  HERO_BIRDS,
  HERO_SCENE_ASSETS,
  HERO_SNOW_MID,
  HERO_SNOW_NEAR,
  HERO_WIND_STREAKS,
  MOBILE_MEDIA,
  type HeroSceneName,
  type HeroSnowFlake,
} from "./hero-scene"

/**
 * 一层雪点。
 *
 * 结构是「外层管下落、内层管风摆」：
 * 下落是 translate3d(drift, 110vh)，风摆是内层的左右平移，
 * 两个动画作用在不同元素上，就不会互相覆盖 transform。
 */
function SnowLayer({ flakes, tier }: { flakes: HeroSnowFlake[]; tier: "mid" | "near" }) {
  return (
    <div className={`hero-fx-snow-${tier}`}>
      {flakes.map((flake, index) => (
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
              "--sway-amp": `${flake.swayAmp}px`,
              "--sway-dur": `${flake.swayDur}s`,
              "--sway-delay": `${flake.swayDelay}s`,
            } as CSSProperties
          }
        >
          <span className="hero-flake-core" />
        </span>
      ))}
    </div>
  )
}

/**
 * 一层场景：底图 + 夜色（仅江湖态）+ 文字底衬 + 动态层。
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

      {/* 文字底衬：手机上文字会压在主体上，需要一层场景色的薄雾 */}
      <div className="hero-scrim" data-scene={scene} />

      {/*
        动态层放在**底衬之后**（画在底衬上面），但仍然在文字之下
        —— 文字容器带 z-10，永远压在最上面。
        第一版把它放在底衬之前，结果雪落到画面下半部就被那层纸色雾冲淡了：
        实测截图里只有上半屏幕看得到雪。
      */}
      <div className="hero-fx">
        {scene === "snow" && (
          <>
            {/* 远层：平铺的雪点纹理，零 DOM 节点；斜落、无缝 */}
            <div className="hero-fx-snow-far" />

            {/* 轻风痕：几条极淡的斜向痕迹，和雪同向 */}
            <div className="hero-fx-wind">
              {HERO_WIND_STREAKS.map((streak, index) => (
                <span
                  key={index}
                  className="hero-wind-streak"
                  style={
                    {
                      "--streak-top": `${streak.top}%`,
                      "--streak-len": `${streak.length}px`,
                      "--streak-dur": `${streak.dur}s`,
                      "--streak-delay": `${streak.delay}s`,
                      "--streak-opacity": streak.opacity,
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            {/* 中景 / 近景：尺寸、速度、模糊都不同 —— 这就是雪的景深 */}
            <SnowLayer flakes={HERO_SNOW_MID} tier="mid" />
            <SnowLayer flakes={HERO_SNOW_NEAR} tier="near" />
          </>
        )}

        {scene === "jianghu" && (
          <>
            {/* 酒旗旁的一点暖光：忽明忽暗（不规则），像被风吹的烛火 */}
            <div className="hero-fx-lamp" />

            {/* 归鸟：五只，深浅不同，带拍翅 */}
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
    </div>
  )
}
