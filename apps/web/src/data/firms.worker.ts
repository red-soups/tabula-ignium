// FIRMS CSV 하나를 받아 열 단위 배열로 바꾸는 Worker. 7일 파일(수십 MB)이 메인 스레드를 막지 않게 한다.
import { createFirmsParser, staticSet, type FirmsChunk, type StaticSourceTable } from './firmsParse'

export interface FirmsRequest {
  url: string
  /** Sensor code for rows whose satellite column is ambiguous; see SATELLITES in firms.ts. */
  sensor: number
  /** Static heat-source table to filter against; empty string = no filtering. */
  staticUrl: string
}

export type FirmsMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'done'; chunk: FirmsChunk }
  | { type: 'error'; message: string }

// Typed by hand: the project compiles against the DOM lib, whose `self` is a Window.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<FirmsRequest>) => void) | null
  postMessage(message: FirmsMessage, transfer?: Transferable[]): void
}

async function loadStatic(url: string): Promise<Set<number>> {
  if (!url) return new Set()
  try {
    const res = await fetch(url)
    if (!res.ok) return new Set()
    return staticSet((await res.json()) as StaticSourceTable)
  } catch {
    return new Set() // 위치표가 없어도 점은 보여 준다 (거르기만 빠짐)
  }
}

scope.onmessage = async (e: MessageEvent<FirmsRequest>) => {
  try {
    const { url, sensor, staticUrl } = e.data
    const [cells, res] = await Promise.all([loadStatic(staticUrl), fetch(url)])
    if (!res.ok || !res.body) throw new Error(`FIRMS ${res.status} ${res.statusText}`)
    const total = Number(res.headers.get('content-length')) || 0
    const parser = createFirmsParser(sensor, cells, total)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let loaded = 0
    let lastPost = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      loaded += value.length // CSV is ASCII, so characters ≈ bytes
      parser.push(value)
      const now = performance.now()
      if (now - lastPost > 120) {
        lastPost = now
        scope.postMessage({ type: 'progress', loaded, total })
      }
    }
    const chunk = parser.finish()
    scope.postMessage({ type: 'done', chunk }, [
      chunk.lat.buffer, chunk.lon.buffer, chunk.frp.buffer, chunk.time.buffer,
      chunk.confidence.buffer, chunk.sensor.buffer, chunk.day.buffer,
    ])
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error).message })
  }
}
