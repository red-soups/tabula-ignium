import { useQuery } from '@tanstack/react-query'
import { getChildRegionMaps, getRegionMap, getRegions } from './regions'

export const regionQueryKey = (parentId: number | null) =>
  ['regions-ko-v1', parentId ?? 'root'] as const

export function useRegionsQuery(
  parentId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: regionQueryKey(parentId),
    queryFn: ({ signal }) => getRegions(parentId, signal),
    enabled,
    staleTime: 5 * 60 * 1_000,
  })
}

export const regionMapQueryKey = (regionId: number | null) =>
  ['region-map-ko-v1', regionId ?? 'none'] as const

export function useRegionMapQuery(
  regionId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: regionMapQueryKey(regionId),
    queryFn: ({ signal }) => getRegionMap(regionId as number, signal),
    enabled: enabled && regionId !== null,
    staleTime: 5 * 60 * 1_000,
  })
}

export const childRegionMapsQueryKey = (parentId: number | null) =>
  ['region-maps-ko-v1', 'children', parentId ?? 'none'] as const

export function useChildRegionMapsQuery(
  parentId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: childRegionMapsQueryKey(parentId),
    queryFn: ({ signal }) => getChildRegionMaps(parentId as number, signal),
    enabled: enabled && parentId !== null,
    staleTime: 5 * 60 * 1_000,
  })
}
