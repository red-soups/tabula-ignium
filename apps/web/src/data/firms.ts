// NASA FIRMS 실시간 화재 탐지 → 지구본(EarthGlobe.setData)이 바로 받는 HotspotSet.
//
// - 공개 파일이라 API 키가 필요 없다. FIRMS가 1시간마다 덮어쓴다.
// - 브라우저는 FIRMS에 직접 요청할 수 없어서(CORS) 같은 출처의 /firms 프록시를 거친다:
//   개발은 vite.config.ts, 배포는 vercel.json의 rewrite.
// - S-NPP는 2026-11-02에 데이터 생산이 끝나 쓰지 않는다.
// - NOAA-20과 NOAA-21은 같은 VIIRS가 약 50분 간격으로 지나가서 같은 불이 거의 두 번 찍힌다.
//   기본은 MODIS + NOAA-20이고, NOAA-21은 켜면 지도에 겹쳐 그리기만 한다 (개수를 더해 비교하지 말 것).
// - 실시간 파일에는 type 열이 없어서 고정 열원 위치표로 가스 플레어·공장·화산을 거른다 (firmsParse.ts).
import type { HotspotSet } from '../globe/EarthGlobe'
import type { FirmsChunk } from './firmsParse'
import type { FirmsMessage, FirmsRequest } from './firms.worker'

const BASE = '/firms/data/active_fire/'
export const STATIC_SOURCES_URL = '/data/static_sources_0.01.json'

export type FirmsRange = '24h' | '48h' | '7d'
export type FirmsSatellite = 'modis' | 'n20' | 'n21'

export const SATELLITES: Record<FirmsSatellite, { label: string; sensor: number; path: (r: FirmsRange) => string }> = {
  modis: { label: 'MODIS', sensor: 0, path: (r) => `modis-c6.1/csv/MODIS_C6_1_Global_${r}.csv` },
  n20: { label: 'VIIRS · NOAA-20', sensor: 3, path: (r) => `noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_${r}.csv` },
  n21: { label: 'VIIRS · NOAA-21', sensor: 4, path: (r) => `noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_${r}.csv` },
}
export const DEFAULT_SATELLITES: readonly FirmsSatellite[] = ['modis', 'n20']

/** Sensor codes stored per detection (index = code). */
const SENSOR_NAMES = ['MODIS · Terra', 'MODIS · Aqua', 'VIIRS · Suomi NPP', 'VIIRS · NOAA-20', 'VIIRS · NOAA-21']
const NO_REGION = 255

export interface FirmsProgress {
  loaded: number
  total: number
  files: number
  done: number
}

export interface FirmsResult {
  hotspots: HotspotSet
  count: number
  bySatellite: Partial<Record<FirmsSatellite, number>>
  /** Detections dropped as gas flares, factories, volcanoes or offshore platforms. */
  removedStatic: number
  /** Newest and oldest detection, minutes since epoch (UTC); null when empty. */
  newest: number | null
  oldest: number | null
}

const cache = new Map<string, Promise<FirmsChunk>>()
const progress = new Map<string, { loaded: number; total: number; done: boolean }>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

function fetchSatellite(sat: FirmsSatellite, range: FirmsRange) {
  const key = `${sat}_${range}`
  let pending = cache.get(key)
  if (pending) return pending
  pending = new Promise<FirmsChunk>((resolve, reject) => {
    const worker = new Worker(new URL('./firms.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<FirmsMessage>) => {
      const m = e.data
      if (m.type === 'progress') {
        progress.set(key, { loaded: m.loaded, total: m.total, done: false })
        notify()
        return
      }
      worker.terminate()
      if (m.type === 'done') {
        const prev = progress.get(key)
        progress.set(key, { loaded: prev?.total ?? 0, total: prev?.total ?? 0, done: true })
        notify()
        resolve(m.chunk)
      } else {
        reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'FIRMS worker failed'))
    }
    const request: FirmsRequest = { url: BASE + SATELLITES[sat].path(range), sensor: SATELLITES[sat].sensor, staticUrl: STATIC_SOURCES_URL }
    worker.postMessage(request)
  })
  // Drop failures (and expire successes after an hour, when FIRMS refreshes) so the next call refetches.
  pending.catch(() => {
    cache.delete(key)
    progress.delete(key)
  })
  pending.then(() => setTimeout(() => cache.delete(key), 60 * 60 * 1000), () => {})
  cache.set(key, pending)
  return pending
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatUtc(min: number) {
  const d = new Date(min * 60000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Merge per-satellite chunks into one HotspotSet for EarthGlobe.setData(). */
export function buildHotspots(chunks: readonly { sat: FirmsSatellite; chunk: FirmsChunk }[]): FirmsResult {
  const count = chunks.reduce((s, c) => s + c.chunk.count, 0)
  const lat = new Float32Array(count)
  const lon = new Float32Array(count)
  const frp = new Float32Array(count)
  const time = new Uint32Array(count)
  const conf = new Uint8Array(count)
  const sensor = new Uint8Array(count)
  const day = new Uint8Array(count)
  const bySatellite: Partial<Record<FirmsSatellite, number>> = {}
  let removedStatic = 0
  let o = 0
  for (const { sat, chunk: c } of chunks) {
    lat.set(c.lat, o)
    lon.set(c.lon, o)
    frp.set(c.frp, o)
    time.set(c.time, o)
    conf.set(c.confidence, o)
    sensor.set(c.sensor, o)
    day.set(c.day, o)
    o += c.count
    bySatellite[sat] = c.count
    removedStatic += c.removedStatic
  }
  let newest: number | null = null
  let oldest: number | null = null
  for (let i = 0; i < count; i++) {
    if (newest === null || time[i] > newest) newest = time[i]
    if (oldest === null || time[i] < oldest) oldest = time[i]
  }

  const hotspots: HotspotSet = {
    count,
    lat,
    lon,
    frp,
    region: new Uint8Array(count).fill(NO_REGION),
    describe: (i) => {
      const c = conf[i]
      return {
        sensor: SENSOR_NAMES[sensor[i]] ?? 'FIRMS',
        confidence: c >= 200 ? ['낮음', '보통', '높음'][c - 200] : `${c}%`,
        when: `${formatUtc(time[i])} · ${day[i] ? '주간' : '야간'}`,
      }
    },
  }
  return { hotspots, count, bySatellite, removedStatic, newest, oldest }
}

/** Downloads (or reuses, for up to an hour) the selected satellites and merges them. */
export async function loadHotspots(
  range: FirmsRange = '7d',
  satellites: readonly FirmsSatellite[] = DEFAULT_SATELLITES,
  onProgress?: (p: FirmsProgress) => void,
): Promise<FirmsResult> {
  const keys = satellites.map((s) => `${s}_${range}`)
  const report = () => {
    let loaded = 0
    let total = 0
    let done = 0
    for (const k of keys) {
      const pg = progress.get(k)
      loaded += pg?.loaded ?? 0
      total += pg?.total ?? 0
      done += pg?.done ? 1 : 0
    }
    onProgress?.({ loaded, total, files: keys.length, done })
  }
  listeners.add(report)
  try {
    const chunks = await Promise.all(satellites.map(async (sat) => ({ sat, chunk: await fetchSatellite(sat, range) })))
    report()
    return buildHotspots(chunks)
  } finally {
    listeners.delete(report)
  }
}
