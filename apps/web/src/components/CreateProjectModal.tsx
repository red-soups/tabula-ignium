import { useEffect, useId, useState } from 'react'
import { Icon } from './Icon'
import { RegionSelector } from './RegionSelector'

// projects, project_regions, project_features 연결 전 사용하는 예시 데이터입니다.
const CREATE_PROJECT_DATA = {
  title: '새 프로젝트',
  description: '프로젝트 정보와 관측할 지역·기능을 설정해 주세요.',
  features: [
    { id: 1, code: 'detection-map', name: '감지점 지도', description: 'MODIS·VIIRS 감지 위치를 지도에 표시' },
    { id: 2, code: 'trend', name: '기간 추이', description: '기간별 화재 감지량 변화 비교' },
    { id: 3, code: 'sensor-compare', name: '센서별 비교', description: '센서별 감지 결과와 특성 비교' },
    { id: 4, code: 'day-night', name: '주야간 분포', description: '낮과 밤 감지 기록을 구분' },
    { id: 5, code: 'frp-analysis', name: 'FRP 분석', description: '화재 복사력 분포와 강도 분석' },
    { id: 6, code: 'density', name: '감지 밀도', description: '격자별 감지 밀집 지역 확인' },
  ],
  cancelLabel: '취소',
  submitLabel: '프로젝트 만들기',
}

type CreateProjectModalProps = {
  open: boolean
  onClose: () => void
}

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const titleId = useId()
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [featureIds, setFeatureIds] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  const toggleId = (id: number, selectedIds: number[], setSelectedIds: (ids: number[]) => void) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id])
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-eyebrow">프로젝트 설정</span>
            <h2 id={titleId}>{CREATE_PROJECT_DATA.title}</h2>
            <p>{CREATE_PROJECT_DATA.description}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기"><Icon name="close" /></button>
        </div>

        <form className="project-form" onSubmit={(event) => { event.preventDefault(); onClose() }}>
          <div className="project-fields">
            <label>
              <span>프로젝트 이름</span>
              <input name="name" autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="예: 아마존 산불 관측" maxLength={200} required />
            </label>
            <label>
              <span>프로젝트 설명 <small>선택</small></span>
              <textarea name="description" value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="프로젝트의 목적이나 관측 내용을 입력하세요." rows={3} />
            </label>
          </div>

          <RegionSelector title="관측 지역" inputName="region_ids" maxSelections={5} />

          <fieldset className="project-selection">
            <legend>프로젝트 기능 <small>{featureIds.length}개 선택</small></legend>
            <div className="feature-option-grid">
              {CREATE_PROJECT_DATA.features.map((feature) => (
                <label className="selection-option feature-selection-option" key={feature.id} title={feature.code}>
                  <input name="feature_ids" type="checkbox" value={feature.id} checked={featureIds.includes(feature.id)} onChange={() => toggleId(feature.id, featureIds, setFeatureIds)} />
                  <span><strong>{feature.name}</strong><small>{feature.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="modal-actions">
            <button className="quiet-button" type="button" onClick={onClose}>{CREATE_PROJECT_DATA.cancelLabel}</button>
            <button className="accent-button" type="submit">{CREATE_PROJECT_DATA.submitLabel}<Icon name="chevron" size={16} /></button>
          </div>
        </form>
      </section>
    </div>
  )
}
