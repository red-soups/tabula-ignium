import { useEffect, useState } from 'react'

// public/fire-timelapse.json: 0.1° cells per year, MODIS-scale (harmonized) detections, South Korea only.
type TimelapseData = {
  through: string
  years: number[]
  totals: number[]
  cells: Record<string, [number, number, number][]>
}

export type HeatCell = { key: string; latitude: number; longitude: number; value: number }

const STEP_MS = 1100
const HOLD_MS = 2200

export function useFireTimelapse(enabled: boolean) {
  const [data, setData] = useState<TimelapseData | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!enabled || data) return
    const controller = new AbortController()
    fetch('/fire-timelapse.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((loaded: TimelapseData | null) => {
        if (!loaded) return
        setData(loaded)
        // Without motion, show the last whole year and stay there.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setIndex(loaded.years.length - 2)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [enabled, data])

  useEffect(() => {
    if (!enabled || !data || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const last = data.years.length - 1
    const timer = window.setTimeout(() => setIndex((current) => current >= last ? 0 : current + 1),
      index === last ? HOLD_MS : STEP_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, data, index])

  if (!data) return null
  const year = data.years[index]
  const cells: HeatCell[] = (data.cells[String(year)] ?? []).map(([latitude, longitude, value]) => ({
    key: `${year}-${latitude}-${longitude}`, latitude, longitude, value,
  }))
  return { year, total: data.totals[index], cells, index, count: data.years.length, through: data.through }
}
