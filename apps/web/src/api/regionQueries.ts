import { useQuery } from '@tanstack/react-query'
import { getRegions } from './regions'

export const regionQueryKey = (parentId: number | null) =>
  ['regions', parentId ?? 'root'] as const

export function useRegionsQuery(
  parentId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: regionQueryKey(parentId),
    queryFn: ({ signal }) => getRegions(parentId, signal),
    enabled,
    staleTime: 60 * 60 * 1_000,
  })
}
