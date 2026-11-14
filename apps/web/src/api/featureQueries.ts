import { useQuery } from '@tanstack/react-query'
import { getFeatures } from './features'

export const featuresQueryKey = ['features'] as const

export function useFeaturesQuery(enabled = true) {
  return useQuery({
    queryKey: featuresQueryKey,
    queryFn: ({ signal }) => getFeatures(signal),
    enabled,
    staleTime: 10 * 60 * 1_000,
  })
}
