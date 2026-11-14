import { useEffect, useId, useState } from 'react'
import type { CreateProjectDetails, ProjectResponse } from '../api/projects'
import { Icon } from './Icon'
import { RegionSelector } from './RegionSelector'

const FEATURE_IDS = Array.from({ length: 10 }, (_, index) => index + 1)

type CreateProjectModalProps = {
  busy: boolean
  error: string
  project?: ProjectResponse | null
  onClose: () => void
  onSubmit: (details: CreateProjectDetails) => void
}

export function ProjectModal({ busy, error, project = null, onClose, onSubmit }: CreateProjectModalProps) {
  const titleId = useId()
  const [projectName, setProjectName] = useState(project?.name ?? '')
  const [projectDescription, setProjectDescription] = useState(project?.description ?? '')
  const [regionIds, setRegionIds] = useState<number[]>(() => project?.regions.map((region) => region.id) ?? [])
  const [featureIds, setFeatureIds] = useState<number[]>(() => project?.features.map((feature) => feature.id) ?? [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  const toggleId = (id: number, selectedIds: number[], setSelectedIds: (ids: number[]) => void) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id])
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-eyebrow">{project ? '프로젝트 수정' : '프로젝트 설정'}</span>
            <h2 id={titleId}>{project ? project.name : '새 프로젝트'}</h2>
            <p>프로젝트 정보와 관측할 지역·기능을 설정해 주세요.</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기" disabled={busy}><Icon name="close" /></button>
        </div>

        <form className="project-form" onSubmit={(event) => {
          event.preventDefault()
          if (!busy && projectName.trim() && regionIds.length > 0 && featureIds.length > 0) {
            onSubmit({
              name: projectName.trim(),
              description: projectDescription.trim(),
              regionIds,
              featureIds,
            })
          }
        }}>
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

          <RegionSelector
            title="관측 지역"
            inputName="region_ids"
            maxSelections={5}
            initialSelections={project?.regions.map((region) => ({ id: region.id, label: region.name }))}
            onSelectionChange={setRegionIds}
          />

          <fieldset className="project-selection">
            <legend>프로젝트 기능 <small>{featureIds.length}개 선택</small></legend>
            <div className="feature-option-grid">
              {FEATURE_IDS.map((featureId) => (
                <label className="selection-option feature-selection-option" key={featureId}>
                  <input name="feature_ids" type="checkbox" value={featureId} checked={featureIds.includes(featureId)} onChange={() => toggleId(featureId, featureIds, setFeatureIds)} />
                  <span><strong>기능 {featureId}</strong><small>임시 기능 ID {featureId}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>취소</button>
            <button className="accent-button" type="submit" disabled={busy || !projectName.trim() || regionIds.length === 0 || featureIds.length === 0}>
              {busy ? '저장 중…' : project ? '수정 저장' : '프로젝트 만들기'}<Icon name="chevron" size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
