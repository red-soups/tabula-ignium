import { useQuery } from '@tanstack/react-query'
import {
  getConfidenceDistribution, getFirePoints, getFireSummary, getMonthlyFireTrend,
  type ConfidenceConfig, type FirePointsConfig, type FireSummaryConfig, type MonthlyTrendConfig,
} from './fireData'

export const fireSummaryQueryKey = (regionId: number, config: FireSummaryConfig) => [
  'fire-data', 'summary', regionId, config,
] as const

export function useFireSummaryQuery(
  regionId: number,
  config: FireSummaryConfig,
) {
  return useQuery({
    queryKey: fireSummaryQueryKey(regionId, config),
    queryFn: ({ signal }) => getFireSummary(regionId, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useFirePointsQuery(regionId: number, config: FirePointsConfig) {
  return useQuery({
    queryKey: ['fire-data', 'points', regionId, config] as const,
    queryFn: ({ signal }) => getFirePoints(regionId, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useMonthlyFireTrendQuery(regionId: number, config: MonthlyTrendConfig) {
  return useQuery({
    queryKey: ['fire-data', 'monthly', regionId, config] as const,
    queryFn: ({ signal }) => getMonthlyFireTrend(regionId, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}

export function useConfidenceDistributionQuery(regionId: number, config: ConfidenceConfig) {
  return useQuery({
    queryKey: ['fire-data', 'confidence', regionId, config] as const,
    queryFn: ({ signal }) => getConfidenceDistribution(regionId, config, signal),
    staleTime: 5 * 60 * 1_000,
  })
}
