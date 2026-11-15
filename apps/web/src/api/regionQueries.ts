import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getChildRegionMaps, getRegionMap, getRegions } from './regions'

export const regionQueryKey = (parentId: number | null, language: string) =>
  ['regions-v2', language, parentId ?? 'root'] as const

export function useRegionsQuery(
  parentId: number | null,
  enabled = true,
) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'ko'
  return useQuery({
    queryKey: regionQueryKey(parentId, language),
    queryFn: ({ signal }) => getRegions(parentId, signal, language),
    enabled,
    staleTime: 5 * 60 * 1_000,
  })
}

export const regionMapQueryKey = (regionId: number | null, language: string) =>
  ['region-map-v2', language, regionId ?? 'none'] as const

export function useRegionMapQuery(
  regionId: number | null,
  enabled = true,
) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'ko'
  return useQuery({
    queryKey: regionMapQueryKey(regionId, language),
    queryFn: ({ signal }) => getRegionMap(regionId as number, signal, language),
    enabled: enabled && regionId !== null,
    staleTime: 5 * 60 * 1_000,
  })
}

export const childRegionMapsQueryKey = (parentId: number | null, language: string) =>
  ['region-maps-v2', language, 'children', parentId ?? 'none'] as const

export function useChildRegionMapsQuery(
  parentId: number | null,
  enabled = true,
) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'ko'
  return useQuery({
    queryKey: childRegionMapsQueryKey(parentId, language),
    queryFn: ({ signal }) => getChildRegionMaps(parentId as number, signal, language),
    enabled: enabled && parentId !== null,
    staleTime: 5 * 60 * 1_000,
  })
}
