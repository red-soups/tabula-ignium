import { useState } from 'react'
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
          {selectedRegions.length}/{maxSelections}개 선택
        </small>
      </legend>

      <div className="region-selectors">
        <label>
          <span>
            시·도 <small>선택</small>
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
                  ? '불러오는 중…'
                  : '시·도 검색'
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
            군·구 <small>선택</small>
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
                ? '시·도 먼저 선택'
                : districtsQuery.isPending
                  ? '불러오는 중…'
                  : '군·구 검색'
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
          추가
        </button>
      </div>

      {hasQueryError && (
        <p
          className="region-fetch-error"
          role="alert"
        >
          지역 정보를 불러오지 못했습니다.
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
              aria-label={`${region.label} 삭제`}
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
            선택한 지역이 없습니다.
          </span>
        )}
      </div>
    </fieldset>
  )
}
