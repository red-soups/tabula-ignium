export type SensorFilter = 'ALL' | 'MODIS' | 'VIIRS'
export type ConfidenceFilter = 'ALL' | 'high' | 'nominal' | 'low'

export type AnalysisBounds = {
  west: number
  south: number
  east: number
  north: number
}

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

export type PeriodAnalysisConfig = {
  fromPeriod: string
  toPeriod: string
  sensor: SensorFilter
}

export type HotspotConfig = PeriodAnalysisConfig & {
  gridMeters: 2500 | 5000 | 10000
}

export type FireSummary = {
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
  period: string
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

export type YearlyFireTrend = {
  year: number
  harmonized: number
  low: number | null
  high: number | null
  complete: boolean
  harmonizedFrp: number | null
  mwPerDetection: number | null
  rawModis: number
  rawViirs: number | null
}

export type LargeFireFrequency = {
  occurrenceYearCount: number
  returnPeriodYears: number | null
  yearsWithAnyFire: number
  largestMonths: Array<{ period: string; harmonized: number; timesNormal: number | null }>
}

export type HighRiskMonth = {
  month: number
  mean: number
  share: number
  highRisk: boolean
}

export type NearestFire = {
  id: number
  latitude: number
  longitude: number
  distanceKm: number
  frp: number
  sensor: string
  confidenceLevel: string
  observedAt: string
  within1Km: number
  within5Km: number
  within10Km: number
}

export type FireIntensityDistribution = {
  intensityLevel: string
  observationCount: number
  percentage: number
  averageFrp: number
  maximumFrp: number
}

export type DayNightDistribution = {
  periodType: string
  observationCount: number
  percentage: number
  averageFrp: number
  maximumFrp: number
}

export type PeriodComparison = {
  currentFromPeriod: string
  currentToPeriod: string
  previousFromPeriod: string
  previousToPeriod: string
  currentObservationCount: number
  previousObservationCount: number
  observationChangeRate: number | null
  currentAverageFrp: number | null
  previousAverageFrp: number | null
  averageFrpChangeRate: number | null
  currentMaximumFrp: number | null
  previousMaximumFrp: number | null
}

export type FireHotspot = {
  hotspotRank: number
  centerLatitude: number
  centerLongitude: number
  observationCount: number
  averageFrp: number
  maximumFrp: number
}

export class FireDataRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Fire data request failed')
    this.status = status
  }
}

export async function getFireSummary(
  bounds: AnalysisBounds,
  config: FireSummaryConfig,
  signal: AbortSignal,
): Promise<FireSummary> {
  const params = new URLSearchParams({
    ...boundsParams(bounds),
    fromPeriod: config.fromPeriod,
    toPeriod: config.toPeriod,
    sensor: config.sensor,
    confidenceLevel: config.confidenceLevel,
  })
  const response = await fetch(`/api/fire/summary?${params}`, { signal })
  if (!response.ok) throw new FireDataRequestError(response.status)
  return response.json()
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new FireDataRequestError(response.status)
  return response.json()
}

function boundsParams(bounds: AnalysisBounds) {
  return {
    west: String(bounds.west), south: String(bounds.south),
    east: String(bounds.east), north: String(bounds.north),
  }
}

export function getFirePoints(bounds: AnalysisBounds, config: FirePointsConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    ...boundsParams(bounds),
    period: config.period, sensor: config.sensor,
    confidenceLevel: config.confidenceLevel, limit: '1000',
  })
  return getJson<FirePoint[]>(`/api/fire/points?${params}`, signal)
}

export function getMonthlyFireTrend(bounds: AnalysisBounds, config: MonthlyTrendConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    ...boundsParams(bounds),
    fromPeriod: config.fromPeriod, toPeriod: config.toPeriod, sensor: config.sensor,
  })
  return getJson<MonthlyFireTrend[]>(`/api/fire/monthly?${params}`, signal)
}

export function getConfidenceDistribution(bounds: AnalysisBounds, config: ConfidenceConfig, signal: AbortSignal) {
  const params = new URLSearchParams({
    ...boundsParams(bounds),
    fromPeriod: config.fromPeriod, toPeriod: config.toPeriod, sensor: config.sensor,
  })
  return getJson<ConfidenceDistribution[]>(`/api/fire/confidence?${params}`, signal)
}

function periodAnalysisParams(bounds: AnalysisBounds, config: PeriodAnalysisConfig) {
  return new URLSearchParams({
    ...boundsParams(bounds), fromPeriod: config.fromPeriod,
    toPeriod: config.toPeriod, sensor: config.sensor,
  })
}

export function getFireIntensity(bounds: AnalysisBounds, config: PeriodAnalysisConfig, signal: AbortSignal) {
  return getJson<FireIntensityDistribution[]>(`/api/fire/intensity?${periodAnalysisParams(bounds, config)}`, signal)
}

export function getDayNightDistribution(bounds: AnalysisBounds, config: PeriodAnalysisConfig, signal: AbortSignal) {
  return getJson<DayNightDistribution[]>(`/api/fire/day-night?${periodAnalysisParams(bounds, config)}`, signal)
}

export function getPeriodComparison(bounds: AnalysisBounds, config: PeriodAnalysisConfig, signal: AbortSignal) {
  return getJson<PeriodComparison>(`/api/fire/period-comparison?${periodAnalysisParams(bounds, config)}`, signal)
}

export function getFireHotspots(bounds: AnalysisBounds, config: HotspotConfig, signal: AbortSignal) {
  const params = periodAnalysisParams(bounds, config)
  params.set('gridMeters', String(config.gridMeters))
  return getJson<FireHotspot[]>(`/api/fire/hotspots?${params}`, signal)
}

export function getYearlyFireTrend(bounds: AnalysisBounds, signal: AbortSignal) {
  return getJson<YearlyFireTrend[]>(`/api/fire/yearly?${new URLSearchParams(boundsParams(bounds))}`, signal)
}

export function getLargeFireFrequency(bounds: AnalysisBounds, signal: AbortSignal) {
  return getJson<LargeFireFrequency>(`/api/fire/large-fire-frequency?${new URLSearchParams(boundsParams(bounds))}`, signal)
}

export function getHighRiskMonths(bounds: AnalysisBounds, signal: AbortSignal) {
  return getJson<HighRiskMonth[]>(`/api/fire/high-risk-months?${new URLSearchParams(boundsParams(bounds))}`, signal)
}

function periodEnd(period: string) {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month, 0)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getNearestFire(bounds: AnalysisBounds, fromPeriod: string, toPeriod: string, signal: AbortSignal) {
  const params = new URLSearchParams({ ...boundsParams(bounds), start: `${fromPeriod}-01`, end: periodEnd(toPeriod) })
  return getJson<NearestFire | null>(`/api/fire/nearest?${params}`, signal)
}
