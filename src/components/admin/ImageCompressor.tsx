"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react"

import {
  COMPRESS_PRESETS,
  compressImage,
  formatBytes,
  type CompressPresetName,
  type CompressResult,
} from "@/lib/image-compress"

interface ImageCompressorProps {
  /** 选中的原始文件（调用方保证非空） */
  file: File
  preset: CompressPresetName
  /** 每次压缩完成都会回调；调用方用它决定上传哪个 blob */
  onResult: (result: CompressResult) => void
  /** 忙碌状态回调（上传按钮可以据此禁用） */
  onBusyChange?: (busy: boolean) => void
}

/** 长边可选的常规档位（0 = 原尺寸）；当前用途的默认值会被动态补进来 */
const EDGE_CHOICES = [3200, 2560, 2048, 1600, 1280]

/** 缩略图用的对象 URL，随依赖变化自动回收 */
function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  return url
}

/**
 * 封面/相册图片的压缩面板。
 *
 * 默认行为是「自动压完就能上传」：面板收起时只显示一行
 * `3.8 MB → 620 KB（-84%）· 2560×1707 · WebP q0.82`。
 * 点「调整」才展开质量滑块、长边档位和 squoosh 那样的左右分割对比。
 *
 * 对比条的实现：上下叠两张图，上层用 `clip-path: inset(0 0 0 X%)` 裁；
 * 拖动与键盘都用一条透明的 range 输入接管（不用自己写指针逻辑，也不用处理无障碍）。
 */
export default function ImageCompressor({
  file,
  preset,
  onResult,
  onBusyChange,
}: ImageCompressorProps) {
  const defaults = COMPRESS_PRESETS[preset]
  const [quality, setQuality] = useState<number>(defaults.quality)
  const [edge, setEdge] = useState<number>(defaults.maxEdge)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompressResult | null>(null)
  const [split, setSplit] = useState(50)
  const latestFile = useRef<File>(file)

  // 换文件时把参数复位到该用途的默认档 —— 但不重置"是否展开"，保留用户的操作习惯
  useEffect(() => {
    if (latestFile.current === file) return
    latestFile.current = file
    setQuality(defaults.quality)
    setEdge(defaults.maxEdge)
    setResult(null)
    setError(null)
  }, [file, defaults.quality, defaults.maxEdge])

  /*
   * 压缩：文件或参数变化就跑一次（带 120ms 去抖，滑块连续拖动只算最后一次）。
   * 这里把 setState 放在 setTimeout 的回调里而不是 effect 体内，
   * 既符合"effect 里不要同步 setState"的约束，也天然实现了取消过期请求。
   */
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setBusy(true)
      onBusyChange?.(true)
      setError(null)
      try {
        const next = await compressImage(file, {
          maxEdge: edge === 0 ? 100000 : edge,
          quality,
          targetBytes: defaults.targetBytes,
        })
        if (cancelled) return
        setResult(next)
        onResult(next)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "压缩失败")
      } finally {
        if (!cancelled) {
          setBusy(false)
          onBusyChange?.(false)
        }
      }
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [file, quality, edge, defaults.targetBytes, onResult, onBusyChange])

  const originalUrl = useObjectUrl(file)
  const compressedUrl = useObjectUrl(result && !result.skipped ? result.blob : null)

  /*
   * 下拉选项：把当前用途的默认长边也塞进去。
   * 封面档是 1880，不在常规档位里 —— 不补的话 select 找不到匹配项，
   * 会默默显示成第一个选项（3200），看起来像"选错了"（实测就是这么发现的）。
   */
  const edgeOptions = useMemo(() => {
    const values = EDGE_CHOICES.includes(defaults.maxEdge)
      ? EDGE_CHOICES
      : [...EDGE_CHOICES, defaults.maxEdge].sort((a, b) => b - a)
    return [
      ...values.map((value) => ({
        value,
        label: `${value}${value === defaults.maxEdge ? "（默认）" : ""}`,
      })),
      { value: 0, label: "原尺寸" },
    ]
  }, [defaults.maxEdge])

  const saving =
    result && result.originalSize > 0
      ? Math.round((1 - result.size / result.originalSize) * 100)
      : 0
  const overLimit = result ? result.size > result.targetBytes : false

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/60">
      {/* 一行摘要 + 展开开关 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
        {busy && (
          <span className="flex items-center gap-1.5 text-gray-500">
            <Loader2 size={12} className="animate-spin" />
            正在压缩…
          </span>
        )}
        {!busy && result && (
          <>
            {result.skipped ? (
              <span className="text-gray-500">
                原样上传 · {formatBytes(result.size)} · {result.width}×{result.height}
                {result.skipReason === "animated" ? "（动图不压缩）" : "（已达标，无需压缩）"}
              </span>
            ) : (
              <>
                <span className="text-gray-400 line-through">{formatBytes(result.originalSize)}</span>
                <span className="font-medium text-gray-700">{formatBytes(result.size)}</span>
                <span className="text-emerald-600">−{saving}%</span>
                <span className="text-gray-400">
                  {result.width}×{result.height} · {result.format.replace("image/", "").toUpperCase()} q
                  {result.quality.toFixed(2)}
                </span>
                {result.attempts.length > 1 && (
                  <span className="text-gray-400">（自动下调 {result.attempts.length - 1} 次达标）</span>
                )}
              </>
            )}
          </>
        )}
        {error && (
          <span className="flex items-center gap-1 text-red-600">
            <TriangleAlert size={12} />
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-gray-500 transition-colors hover:bg-white hover:text-gray-800"
          aria-expanded={expanded}
        >
          调整
          <ChevronDown
            size={13}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {overLimit && !busy && result && (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          已压到 {formatBytes(result.size)}，仍超过 {formatBytes(result.targetBytes)} 的上传上限：
          请把长边或质量再调低一档。
        </p>
      )}

      {expanded && (
        <div className="border-t border-gray-200 px-3 py-3">
          {/* 参数 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              质量 <span className="font-medium text-gray-800">{quality.toFixed(2)}</span>
              <input
                type="range"
                min={0.5}
                max={0.95}
                step={0.01}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
              <span className="flex justify-between text-[11px] text-gray-400">
                <span>更小</span>
                <span>更清晰</span>
              </span>
            </label>

            <label className="block text-xs text-gray-600">
              长边上限
              <select
                value={edge}
                onChange={(event) => setEdge(Number(event.target.value))}
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
              >
                {edgeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => {
              setQuality(defaults.quality)
              setEdge(defaults.maxEdge)
            }}
            className="mt-2 text-[11px] text-accent underline decoration-accent/40 underline-offset-2"
          >
            恢复默认（q{defaults.quality.toFixed(2)} · 长边 {defaults.maxEdge}）
          </button>

          {/* 左右分割对比：只在真的有压缩时显示 */}
          {originalUrl && compressedUrl && !result?.skipped && (
            <div className="mt-3">
              <div
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white select-none"
                style={{ aspectRatio: result ? `${result.width} / ${result.height}` : "3 / 2" }}
              >
                {/* 底层：原图（按压缩后的尺寸对齐，保证两边构图一致） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={originalUrl}
                  alt="原图"
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
                {/* 上层：压缩图，按分割位置裁切 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={compressedUrl}
                  alt="压缩后"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                  draggable={false}
                />
                {/* 分割线 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                  style={{ left: `${split}%` }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[10px] font-medium text-gray-700 shadow"
                  style={{ left: `${split}%` }}
                >
                  ⇄
                </span>
                {/* 用透明 range 接管拖动与键盘 */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(event) => setSplit(Number(event.target.value))}
                  aria-label="对比分割线"
                  className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
                {/* 角标 */}
                <span className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  压缩后 {formatBytes(result?.size ?? 0)}
                </span>
                <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  原图 {formatBytes(result?.originalSize ?? 0)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                拖动分割线对比：左边是原图，右边是压缩结果（同尺寸裁切对齐）。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
