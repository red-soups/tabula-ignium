import { useQuery } from '@tanstack/react-query'
import {
  getConfidenceDistribution, getFirePoints, getFireSummary, getMonthlyFireTrend,
  getHighRiskMonths, getLargeFireFrequency, getNearestFire, getYearlyFireTrend,
  getDayNightDistribution, getFireHotspots, getFireIntensity, getPeriodComparison,
  type ConfidenceConfig, type FirePointsConfig, type FireSummaryConfig, type MonthlyTrendConfig,
  type AnalysisBounds, type HotspotConfig, type PeriodAnalysisConfig,
} from './fireData'

export const fireSummaryQueryKey = (bounds: AnalysisBounds, config: FireSummaryConfig) => [
  'fire-data', 'summary', bounds, config,
] as const

export function useFireSummaryQuery(
  bounds: AnalysisBounds,
  config: FireSummaryConfig,
) {
  return useQuery({
    queryKey: fireSummaryQueryKey(bounds, config),
    queryFn: ({ signal }) => getFireSummary(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useFirePointsQuery(bounds: AnalysisBounds, config: FirePointsConfig) {
  return useQuery({
    queryKey: ['fire-data', 'points', bounds, config] as const,
    queryFn: ({ signal }) => getFirePoints(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useMonthlyFireTrendQuery(bounds: AnalysisBounds, config: MonthlyTrendConfig) {
  return useQuery({
    queryKey: ['fire-data', 'monthly', bounds, config] as const,
    queryFn: ({ signal }) => getMonthlyFireTrend(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useConfidenceDistributionQuery(bounds: AnalysisBounds, config: ConfidenceConfig) {
  return useQuery({
    queryKey: ['fire-data', 'confidence', bounds, config] as const,
    queryFn: ({ signal }) => getConfidenceDistribution(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useYearlyFireTrendQuery(bounds: AnalysisBounds) {
  return useQuery({
    queryKey: ['fire-data', 'yearly', bounds] as const,
    queryFn: ({ signal }) => getYearlyFireTrend(bounds, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useLargeFireFrequencyQuery(bounds: AnalysisBounds) {
  return useQuery({
    queryKey: ['fire-data', 'large-fire-frequency', bounds] as const,
    queryFn: ({ signal }) => getLargeFireFrequency(bounds, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useHighRiskMonthsQuery(bounds: AnalysisBounds) {
  return useQuery({
    queryKey: ['fire-data', 'high-risk-months', bounds] as const,
    queryFn: ({ signal }) => getHighRiskMonths(bounds, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useNearestFireQuery(bounds: AnalysisBounds, fromPeriod: string, toPeriod: string) {
  return useQuery({
    queryKey: ['fire-data', 'nearest', bounds, fromPeriod, toPeriod] as const,
    queryFn: ({ signal }) => getNearestFire(bounds, fromPeriod, toPeriod, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useFireIntensityQuery(bounds: AnalysisBounds, config: PeriodAnalysisConfig) {
  return useQuery({
    queryKey: ['fire-data', 'intensity', bounds, config] as const,
    queryFn: ({ signal }) => getFireIntensity(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useDayNightDistributionQuery(bounds: AnalysisBounds, config: PeriodAnalysisConfig) {
  return useQuery({
    queryKey: ['fire-data', 'day-night', bounds, config] as const,
    queryFn: ({ signal }) => getDayNightDistribution(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function usePeriodComparisonQuery(bounds: AnalysisBounds, config: PeriodAnalysisConfig) {
  return useQuery({
    queryKey: ['fire-data', 'period-comparison', bounds, config] as const,
    queryFn: ({ signal }) => getPeriodComparison(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useFireHotspotsQuery(bounds: AnalysisBounds, config: HotspotConfig) {
  return useQuery({
    queryKey: ['fire-data', 'hotspots', bounds, config] as const,
    queryFn: ({ signal }) => getFireHotspots(bounds, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}
