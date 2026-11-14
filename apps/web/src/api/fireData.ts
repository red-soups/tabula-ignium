export type SensorFilter = 'ALL' | 'MODIS' | 'VIIRS'
export type ConfidenceFilter = 'ALL' | 'high' | 'nominal' | 'low'

export type FireSummaryConfig = {
  fromPeriod: string
  toPeriod: string
  sensor: SensorFilter
  confidenceLevel: ConfidenceFilter
}

export type FirePointsConfig = {
  period: string
  sensor: SensorFilter
  confidenceLevel: ConfidenceFilter
}

export type MonthlyTrendConfig = {
  fromPeriod: string
  toPeriod: string
  sensor: SensorFilter
  metric: 'observationCount' | 'totalFrp' | 'averageFrp'
}

export type ConfidenceConfig = {
  fromPeriod: string
  toPeriod: string
  sensor: SensorFilter
}

export type FireSummary = {
  regionId: number
  observationCount: number
  observedDayCount: number
  earliestObservation: string | null
  latestObservation: string | null
  averageFrp: number | null
  maximumFrp: number | null
  totalFrp: number | null
}

export type FirePoint = {
  id: number
  latitude: number
  longitude: number
  frp: number
  confidenceLevel: string
  sensor: string
  observedAt: string
}

export type MonthlyFireTrend = {
  period: string
  observationCount: number
  totalFrp: number
  averageFrp: number
}

export type ConfidenceDistribution = {
  confidenceLevel: string
  observationCount: number
  percentage: number
}

export class FireDataRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Fire data request failed')
    this.status = status
  }
}

export async function getFireSummary(
  regionId: number,
  config: FireSummaryConfig,
  signal: AbortSignal,
): Promise<FireSummary> {
  const params = new URLSearchParams({
    fromPeriod: config.fromPeriod,
    toPeriod: config.toPeriod,
    sensor: config.sensor,
    confidenceLevel: config.confidenceLevel,
  })
  const response = await fetch(`/api/regions/${regionId}/fire/summary?${params}`, { signal })
  if (!response.ok) throw new FireDataRequestError(response.status)
  return response.json()
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new FireDataRequestError(response.status)
  return response.json()
}

export function getFirePoints(regionId: number, config: FirePointsConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    period: config.period, sensor: config.sensor,
    confidenceLevel: config.confidenceLevel, limit: '1000',
  })
  return getJson<FirePoint[]>(`/api/regions/${regionId}/fire/points?${params}`, signal)
}

export function getMonthlyFireTrend(regionId: number, config: MonthlyTrendConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    fromPeriod: config.fromPeriod, toPeriod: config.toPeriod, sensor: config.sensor,
  })
  return getJson<MonthlyFireTrend[]>(`/api/regions/${regionId}/fire/monthly?${params}`, signal)
}

export function getConfidenceDistribution(regionId: number, config: ConfidenceConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    fromPeriod: config.fromPeriod, toPeriod: config.toPeriod, sensor: config.sensor,
  })
  return getJson<ConfidenceDistribution[]>(`/api/regions/${regionId}/fire/confidence?${params}`, signal)
}
