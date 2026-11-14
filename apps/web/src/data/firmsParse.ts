// FIRMS 실시간 CSV(한 줄 = 탐지 1건)를 열 단위 배열로 읽는다. Worker와 테스트가 같이 쓰는 순수 함수.
//
// 실시간(NRT) 파일에는 `type` 열이 없어서 가스 플레어·공장·화산도 '화재'로 찍힌다.
// 고정 열원 위치표(public/data/static_sources_0.01.json, apps/model/scripts/build_static_sources.py)에
// 있는 약 1 km 칸에 떨어진 탐지는 버린다. 칸 키는 모델 쪽과 같다:
//   floor(lat / 0.01) * 100000 + floor((lon + 180) / 0.01)

export interface FirmsChunk {
  count: number
  lat: Float32Array
  lon: Float32Array
  frp: Float32Array
  /** Acquisition time, minutes since the Unix epoch (UTC). */
  time: Uint32Array
  /** MODIS 0–100; VIIRS low/nominal/high = 200/201/202. */
  confidence: Uint8Array
  sensor: Uint8Array
  /** 1 = daytime overpass. */
  day: Uint8Array
  /** Rows dropped because they fell on a static heat-source cell. */
  removedStatic: number
}

export interface StaticSourceTable {
  res: number
  cells: Record<string, number[]>
}

export const STATIC_RES = 0.01
export const STATIC_KEY_MUL = 100000

export const staticKey = (lat: number, lon: number) =>
  Math.floor(lat / STATIC_RES) * STATIC_KEY_MUL + Math.floor((lon + 180) / STATIC_RES)

export function staticSet(table: StaticSourceTable | null | undefined): Set<number> {
  const set = new Set<number>()
  if (!table) return set
  if (Math.abs(table.res - STATIC_RES) > 1e-9) throw new Error(`static source table res ${table.res} ≠ ${STATIC_RES}`)
  for (const keys of Object.values(table.cells)) for (const k of keys) set.add(k)
  return set
}

/** Streaming CSV → typed arrays. Call push() with text pieces, then finish(). */
export function createFirmsParser(sensor: number, staticCells: Set<number>, sizeHint = 0) {
  let cap = Math.max(1024, Math.ceil(sizeHint / 70))
  let n = 0
  let removedStatic = 0
  let lat = new Float32Array(cap)
  let lon = new Float32Array(cap)
  let frp = new Float32Array(cap)
  let time = new Uint32Array(cap)
  let conf = new Uint8Array(cap)
  let sens = new Uint8Array(cap)
  let day = new Uint8Array(cap)
  const grow = () => {
    cap *= 2
    const g = <T extends Float32Array | Uint32Array | Uint8Array>(a: T): T => {
      const b = new (a.constructor as new (n: number) => T)(cap)
      b.set(a)
      return b
    };
    [lat, lon, frp, time, conf, sens, day] = [g(lat), g(lon), g(frp), g(time), g(conf), g(sens), g(day)]
  }

  let col: Record<string, number> | null = null
  const handle = (line: string) => {
    if (!line) return
    const f = line.split(',')
    if (!col) {
      col = Object.fromEntries(f.map((name, i) => [name.trim(), i]))
      if (col.latitude === undefined || col.longitude === undefined || col.frp === undefined) {
        throw new Error('Unexpected FIRMS CSV header')
      }
      return
    }
    const la = +f[col.latitude]
    const lo = +f[col.longitude]
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return
    if (staticCells.size && staticCells.has(staticKey(la, lo))) {
      removedStatic++
      return
    }
    if (n === cap) grow()
    lat[n] = la
    lon[n] = lo
    frp[n] = Math.max(0, +f[col.frp] || 0)
    const d = f[col.acq_date] ?? ''
    const t = (f[col.acq_time] ?? '0').padStart(4, '0')
    time[n] = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2), +t.slice(2, 4)) / 60000
    const c = f[col.confidence]
    conf[n] = c === 'l' || c === 'low' ? 200 : c === 'n' || c === 'nominal' ? 201 : c === 'h' || c === 'high' ? 202 : Math.min(100, +c || 0)
    const s = f[col.satellite]
    sens[n] = s === 'T' || s === 'Terra' ? 0 : s === 'A' || s === 'Aqua' ? 1 : sensor
    day[n] = f[col.daynight] === 'D' ? 1 : 0
    n++
  }

  let rest = ''
  return {
    push(text: string) {
      const all = rest + text
      let start = 0
      let nl: number
      while ((nl = all.indexOf('\n', start)) !== -1) {
        handle(all.charCodeAt(nl - 1) === 13 ? all.slice(start, nl - 1) : all.slice(start, nl))
        start = nl + 1
      }
      rest = all.slice(start)
    },
    finish(): FirmsChunk {
      handle(rest.trim())
      rest = ''
      return {
        count: n,
        lat: lat.slice(0, n),
        lon: lon.slice(0, n),
        frp: frp.slice(0, n),
        time: time.slice(0, n),
        confidence: conf.slice(0, n),
        sensor: sens.slice(0, n),
        day: day.slice(0, n),
        removedStatic,
      }
    },
  }
}
