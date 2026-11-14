import { useMemo, useState } from 'react'
import { Icon } from './Icon'

// API 연결 전 regions 테이블을 대신하는 0·1·2단계 예시 데이터입니다.
const REGION_SELECTOR_DATA = {
  regions: [
    {
      id: 100,
      name: '서울특별시',
      children: [
        { id: 110, name: '강남구', children: [{ id: 111, name: '역삼동' }, { id: 112, name: '삼성동' }, { id: 113, name: '대치동' }] },
        { id: 120, name: '마포구', children: [{ id: 121, name: '서교동' }, { id: 122, name: '연남동' }, { id: 123, name: '상암동' }] },
      ],
    },
    {
      id: 200,
      name: '부산광역시',
      children: [
        { id: 210, name: '해운대구', children: [{ id: 211, name: '우동' }, { id: 212, name: '중동' }, { id: 213, name: '좌동' }] },
        { id: 220, name: '수영구', children: [{ id: 221, name: '광안동' }, { id: 222, name: '남천동' }, { id: 223, name: '민락동' }] },
      ],
    },
    {
      id: 300,
      name: '경기도',
      children: [
        { id: 310, name: '수원시', children: [{ id: 311, name: '인계동' }, { id: 312, name: '매탄동' }, { id: 313, name: '광교동' }] },
        { id: 320, name: '성남시', children: [{ id: 321, name: '정자동' }, { id: 322, name: '서현동' }, { id: 323, name: '판교동' }] },
      ],
    },
    {
      id: 400,
      name: '제주특별자치도',
      children: [
        { id: 410, name: '제주시', children: [{ id: 411, name: '아라동' }, { id: 412, name: '애월읍' }, { id: 413, name: '조천읍' }] },
        { id: 420, name: '서귀포시', children: [{ id: 421, name: '대정읍' }, { id: 422, name: '성산읍' }, { id: 423, name: '중문동' }] },
      ],
    },
  ],
}

type SelectedRegion = {
  id: number
  label: string
}

type RegionSelectorProps = {
  title: string
  inputName: string
  maxSelections?: number
}

export function RegionSelector({ title, inputName, maxSelections = 5 }: RegionSelectorProps) {
  const [level0Id, setLevel0Id] = useState(0)
  const [level1Id, setLevel1Id] = useState(0)
  const [level2Id, setLevel2Id] = useState(0)
  const [selectedRegions, setSelectedRegions] = useState<SelectedRegion[]>([])

  const level0 = useMemo(() => REGION_SELECTOR_DATA.regions.find((region) => region.id === level0Id), [level0Id])
  const level1 = useMemo(() => level0?.children.find((region) => region.id === level1Id), [level0, level1Id])
  const level2 = useMemo(() => level1?.children.find((region) => region.id === level2Id), [level1, level2Id])

  const addRegion = () => {
    if (!level0 || selectedRegions.length >= maxSelections) return

    const selected = level2 ?? level1 ?? level0
    if (selectedRegions.some((region) => region.id === selected.id)) return

    const label = [level0.name, level1?.name, level2?.name].filter(Boolean).join(' ')
    setSelectedRegions((regions) => [...regions, { id: selected.id, label }])
    setLevel0Id(0)
    setLevel1Id(0)
    setLevel2Id(0)
  }

  return (
    <fieldset className="region-fieldset">
      <legend>{title} <small>{selectedRegions.length}/{maxSelections}개 선택</small></legend>
      <div className="region-selectors">
        <label>
          <span>0단계</span>
          <select value={level0Id} onChange={(event) => { setLevel0Id(Number(event.target.value)); setLevel1Id(0); setLevel2Id(0) }}>
            <option value={0}>시·도 선택</option>
            {REGION_SELECTOR_DATA.regions.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}
          </select>
        </label>
        <label>
          <span>1단계</span>
          <select value={level1Id} disabled={!level0} onChange={(event) => { setLevel1Id(Number(event.target.value)); setLevel2Id(0) }}>
            <option value={0}>시·군·구 선택</option>
            {level0?.children.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}
          </select>
        </label>
        <label>
          <span>2단계</span>
          <select value={level2Id} disabled={!level1} onChange={(event) => setLevel2Id(Number(event.target.value))}>
            <option value={0}>읍·면·동 선택</option>
            {level1?.children.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}
          </select>
        </label>
        <button className="region-add-button" type="button" onClick={addRegion} disabled={!level0 || selectedRegions.length >= maxSelections}>추가</button>
      </div>

      <div className="region-chips" aria-live="polite">
        {selectedRegions.map((region) => (
          <span className="region-chip" key={region.id}>
            {region.label}
            <button type="button" onClick={() => setSelectedRegions((regions) => regions.filter((item) => item.id !== region.id))} aria-label={`${region.label} 삭제`}><Icon name="close" size={13} /></button>
            <input type="hidden" name={inputName} value={region.id} />
          </span>
        ))}
        {selectedRegions.length === 0 && <span className="region-empty">선택한 지역이 없습니다.</span>}
      </div>
    </fieldset>
  )
}
