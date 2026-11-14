import { Icon } from './Icon'
import type { Project } from './ProjectGrid'

type DeleteProjectModalProps = {
  project: Project
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function DeleteProjectModal({ project, busy, error, onClose, onConfirm }: DeleteProjectModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="delete-project-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="delete-modal-icon"><Icon name="trash" size={22} /></div>
        <div className="delete-modal-copy">
          <h2 id="delete-project-title">프로젝트를 삭제할까요?</h2>
          <p><strong>{project.name}</strong> 프로젝트와 저장된 관측 지역 및 기능 설정이 삭제됩니다.</p>
          <p className="delete-warning">삭제한 프로젝트는 복구할 수 없습니다.</p>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>취소</button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </section>
    </div>
  )
}
