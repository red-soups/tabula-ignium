import { lazy, Suspense, useEffect, useId, useRef } from 'react'
import { Icon } from './Icon'
import './GlobePreview.css'

const FireGlobe = lazy(() => import('./FireGlobe'))

export function GlobePreview({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="globe-preview"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="globe-preview-header">
        <h2 id={titleId}>지구본 미리보기</h2>
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">
          <Icon name="close" />
        </button>
      </header>
      <Suspense fallback={<p className="globe-preview-loading" role="status">지구본을 불러오는 중입니다.</p>}>
        <FireGlobe />
      </Suspense>
    </dialog>
  )
}
