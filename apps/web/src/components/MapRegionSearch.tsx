import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        <span className="workspace-small-label">{t('region.searchTitle')}</span>
        <div className="workspace-region-search-actions">
          {canReset && <button className="workspace-region-reset" type="button" onClick={onReset}
            aria-label={t('region.reset')} title={t('region.reset')}>
            <Icon name="refresh" size={14} />
          </button>}
          {areaAction}
        </div>
      </div>
      <div className="workspace-region-search-grid">
        <label>
          <span>{t('region.province')}</span>
          <SearchableSelect
            value={cityId ? String(cityId) : ''}
            options={citiesQuery.data?.map((region) => ({
              value: String(region.id), label: region.name,
            })) ?? []}
            placeholder={citiesQuery.isPending ? t('common.loading') : t('region.provinceSearch')}
            disabled={!korea || citiesQuery.isPending || citiesQuery.isError}
            onChange={(value) => {
              onCityChange(Number(value))
              onDistrictChange(0)
            }}
          />
        </label>
        <label>
          <span>{t('region.district')}</span>
          <SearchableSelect
            value={districtId ? String(districtId) : ''}
            options={districtsQuery.data?.map((region) => ({
              value: String(region.id), label: region.name,
            })) ?? []}
            placeholder={!cityId ? t('region.selectProvinceFirst') : districtsQuery.isPending ? t('common.loading') : t('region.districtSearch')}
            disabled={!cityId || districtsQuery.isPending || districtsQuery.isError}
            onChange={(value) => onDistrictChange(Number(value))}
          />
        </label>
      </div>
      {mapQuery.isPending && focusedId && <small className="workspace-region-state">{t('region.findingOnMap')}</small>}
      {hasError && <small className="workspace-region-error" role="alert">{t('region.loadError')}</small>}
    </div>
  )
}
