import { useEffect, type ReactNode } from 'react'
import { useRegionMapQuery, useRegionsQuery } from '../api/regionQueries'
import type { RegionMap } from '../api/regions'
import { Icon } from './Icon'
import { SearchableSelect } from './SearchableSelect'

export function MapRegionSearch({ cityId, districtId, canReset, areaAction, onCityChange, onDistrictChange, onRegionFocus, onReset }: {
  cityId: number
  districtId: number
  canReset: boolean
  areaAction: ReactNode
  onCityChange: (regionId: number) => void
  onDistrictChange: (regionId: number) => void
  onRegionFocus: (region: RegionMap) => void
  onReset: () => void
}) {
  const countriesQuery = useRegionsQuery(null)
  const korea = countriesQuery.data?.find((region) =>
    region.countryCode === 'KR' && region.level === 0)
  const citiesQuery = useRegionsQuery(korea?.id ?? null, Boolean(korea))
  const districtsQuery = useRegionsQuery(cityId || null, cityId > 0)
  const focusedId = districtId || cityId || null
  const mapQuery = useRegionMapQuery(focusedId)

  useEffect(() => {
    if (mapQuery.data) onRegionFocus(mapQuery.data)
  }, [mapQuery.data, onRegionFocus])

  const hasError = countriesQuery.isError || citiesQuery.isError
    || districtsQuery.isError || mapQuery.isError

  return (
    <div className="workspace-region-search">
      <div className="workspace-region-search-head">
        <span className="workspace-small-label">행정구역 검색</span>
        <div className="workspace-region-search-actions">
          {canReset && <button className="workspace-region-reset" type="button" onClick={onReset}
            aria-label="행정구역 다시 선택" title="행정구역 다시 선택">
            <Icon name="refresh" size={14} />
          </button>}
          {areaAction}
        </div>
      </div>
      <div className="workspace-region-search-grid">
        <label>
          <span>시·도</span>
          <SearchableSelect
            value={cityId ? String(cityId) : ''}
            options={citiesQuery.data?.map((region) => ({
              value: String(region.id), label: region.name,
            })) ?? []}
            placeholder={citiesQuery.isPending ? '불러오는 중…' : '시·도 검색'}
            disabled={!korea || citiesQuery.isPending || citiesQuery.isError}
            onChange={(value) => {
              onCityChange(Number(value))
              onDistrictChange(0)
            }}
          />
        </label>
        <label>
          <span>시·군·구</span>
          <SearchableSelect
            value={districtId ? String(districtId) : ''}
            options={districtsQuery.data?.map((region) => ({
              value: String(region.id), label: region.name,
            })) ?? []}
            placeholder={!cityId ? '시·도 먼저 선택' : districtsQuery.isPending ? '불러오는 중…' : '시·군·구 검색'}
            disabled={!cityId || districtsQuery.isPending || districtsQuery.isError}
            onChange={(value) => onDistrictChange(Number(value))}
          />
        </label>
      </div>
      {mapQuery.isPending && focusedId && <small className="workspace-region-state">지도에서 위치를 찾는 중…</small>}
      {hasError && <small className="workspace-region-error" role="alert">행정구역 정보를 불러오지 못했습니다.</small>}
    </div>
  )
}
