import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegionsQuery } from '../api/regionQueries'
import { Icon } from './Icon'
import { SearchableSelect } from './SearchableSelect'

export type SelectedRegion = {
  id: number
  label: string
}

type RegionSelectorProps = {
  title: string
  inputName: string
  maxSelections?: number
  initialSelections?: SelectedRegion[]
  onSelectionChange?: (regionIds: number[]) => void
}

export function RegionSelector({
  title,
  inputName,
  maxSelections = 5,
  initialSelections = [],
  onSelectionChange,
}: RegionSelectorProps) {
  const { t } = useTranslation()
  const [cityId, setCityId] = useState(0)
  const [districtId, setDistrictId] = useState(0)
  const [selectedRegions, setSelectedRegions] =
    useState<SelectedRegion[]>(initialSelections)

  const countriesQuery = useRegionsQuery(null)
  const country = countriesQuery.data?.find(
    (item) => item.countryCode === 'KR' && item.level === 0,
  )
  const countryId = country?.id ?? 0
  const citiesQuery = useRegionsQuery(countryId || null, countryId > 0)
  const districtsQuery = useRegionsQuery(cityId || null, cityId > 0)
  const city = citiesQuery.data?.find(
    (item) => item.id === cityId,
  )
  const district = districtsQuery.data?.find(
    (item) => item.id === districtId,
  )

  const updateSelectedRegions = (nextRegions: SelectedRegion[]) => {
    setSelectedRegions(nextRegions)
    onSelectionChange?.(nextRegions.map((region) => region.id))
  }

  const addRegion = () => {
    const selected = district ?? city

    if (
      !city ||
      !selected ||
      selectedRegions.length >= maxSelections
    ) {
      return
    }

    const isAlreadySelected = selectedRegions.some(
      (region) => region.id === selected.id,
    )

    if (isAlreadySelected) {
      return
    }

    const label = [
      city.name,
      district?.name,
    ]
      .filter(Boolean)
      .join(' ')

    updateSelectedRegions([
      ...selectedRegions,
      {
        id: selected.id,
        label,
      },
    ])

    setCityId(0)
    setDistrictId(0)
  }

  const removeRegion = (regionId: number) => {
    updateSelectedRegions(
      selectedRegions.filter(
        (region) => region.id !== regionId,
      ),
    )
  }

  const hasQueryError =
    countriesQuery.isError ||
    citiesQuery.isError ||
    districtsQuery.isError

  return (
    <fieldset className="region-fieldset">
      <legend>
        {title}{' '}
        <small>
          {t('region.selectedCount', { selected: selectedRegions.length, max: maxSelections })}
        </small>
      </legend>

      <div className="region-selectors">
        <label>
          <span>
            {t('region.province')} <small>{t('region.optional')}</small>
          </span>

          <SearchableSelect
            value={cityId ? String(cityId) : ''}
            options={
              citiesQuery.data?.map((item) => ({
                value: String(item.id),
                label: item.name,
              })) ?? []
            }
            placeholder={
              countriesQuery.isPending || citiesQuery.isPending
                  ? t('common.loading')
                  : t('region.provinceSearch')
            }
            disabled={
              !countryId ||
              countriesQuery.isPending ||
              countriesQuery.isError ||
              citiesQuery.isPending ||
              citiesQuery.isError
            }
            onChange={(value) => {
              setCityId(Number(value))
              setDistrictId(0)
            }}
          />
        </label>

        <label>
          <span>
            {t('region.district')} <small>{t('region.optional')}</small>
          </span>

          <SearchableSelect
            value={districtId ? String(districtId) : ''}
            options={
              districtsQuery.data?.map((item) => ({
                value: String(item.id),
                label: item.name,
              })) ?? []
            }
            placeholder={
              !cityId
                ? t('region.selectProvinceFirst')
                : districtsQuery.isPending
                  ? t('common.loading')
                  : t('region.districtSearch')
            }
            disabled={
              !cityId ||
              districtsQuery.isPending ||
              districtsQuery.isError
            }
            onChange={(value) => {
              setDistrictId(Number(value))
            }}
          />
        </label>

        <button
          className="region-add-button"
          type="button"
          onClick={addRegion}
          disabled={
            !city ||
            selectedRegions.length >= maxSelections
          }
        >
          {t('common.add')}
        </button>
      </div>

      {hasQueryError && (
        <p
          className="region-fetch-error"
          role="alert"
        >
          {t('region.loadError')}
        </p>
      )}

      <div
        className="region-chips"
        aria-live="polite"
      >
        {selectedRegions.map((region) => (
          <span
            className="region-chip"
            key={region.id}
          >
            {region.label}

            <button
              type="button"
              onClick={() => removeRegion(region.id)}
              aria-label={t('region.deleteLabel', { label: region.label })}
            >
              <Icon
                name="close"
                size={13}
              />
            </button>

            <input
              type="hidden"
              name={inputName}
              value={region.id}
            />
          </span>
        ))}

        {selectedRegions.length === 0 && (
          <span className="region-empty">
            {t('region.noSelection')}
          </span>
        )}
      </div>
    </fieldset>
  )
}
