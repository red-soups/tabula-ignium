import type {
  ConfidenceConfig,
  FirePointsConfig,
  FireSummaryConfig,
  HotspotConfig,
  MonthlyTrendConfig,
  PeriodAnalysisConfig,
} from '../../api/fireData'

export type DocumentFeatureConfigs = {
  summary: FireSummaryConfig
  points: FirePointsConfig
  monthly: MonthlyTrendConfig
  confidence: ConfidenceConfig
  nearest: { fromPeriod: string; toPeriod: string }
  intensity: PeriodAnalysisConfig
  dayNight: PeriodAnalysisConfig
  comparison: PeriodAnalysisConfig
  hotspots: HotspotConfig
}

export function periodAt(offsetFromLatestCompleteMonth: number) {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 1 + offsetFromLatestCompleteMonth, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftPeriod(period: string, offset: number) {
  if (!period) return ''
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function periodMonthCount(fromPeriod: string, toPeriod: string) {
  if (!fromPeriod || !toPeriod) return 0
  const [fromYear, fromMonth] = fromPeriod.split('-').map(Number)
  const [toYear, toMonth] = toPeriod.split('-').map(Number)
  return (toYear - fromYear) * 12 + toMonth - fromMonth + 1
}

export const DEFAULT_SUMMARY_CONFIG: FireSummaryConfig = {
  fromPeriod: periodAt(-11),
  toPeriod: periodAt(0),
  sensor: 'ALL',
  confidenceLevel: 'ALL',
}

export const DEFAULT_POINTS_CONFIG: FirePointsConfig = {
  period: periodAt(0),
  sensor: 'ALL',
  confidenceLevel: 'ALL',
}

export const DEFAULT_MONTHLY_CONFIG: MonthlyTrendConfig = {
  fromPeriod: periodAt(-11),
  toPeriod: periodAt(0),
  sensor: 'ALL',
  metric: 'observationCount',
}

export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  fromPeriod: periodAt(-11),
  toPeriod: periodAt(0),
  sensor: 'ALL',
}

export const DEFAULT_PERIOD_ANALYSIS_CONFIG: PeriodAnalysisConfig = {
  fromPeriod: periodAt(-11),
  toPeriod: periodAt(0),
  sensor: 'ALL',
}

export const DEFAULT_HOTSPOT_CONFIG: HotspotConfig = {
  ...DEFAULT_PERIOD_ANALYSIS_CONFIG,
  gridMeters: 5000,
}
