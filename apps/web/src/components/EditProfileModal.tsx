import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CurrentUser, ProfileDetails } from '../api/auth'
import { Icon } from './Icon'
import { RegionSelector } from './RegionSelector'

type EditProfileModalProps = {
  user: CurrentUser
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (details: ProfileDetails) => void
}

export function EditProfileModal({ user, busy, error, onClose, onSubmit }: EditProfileModalProps) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const emailHintId = useId()
  const [name, setName] = useState(user.name)
  const initialRegions = user.interestedRegions.slice(0, 1)
  const [regionIds, setRegionIds] = useState<number[]>(initialRegions.map(({ id }) => id))

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && name.trim() && regionIds.length > 0) {
      onSubmit({ name: name.trim(), regionIds })
    }
  }

  return (
    <dialog
      ref={dialog}
      className="signup-modal"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    >
      <div className="signup-modal-head">
        <div>
          <h2 id={titleId}>{t('auth.editProfile')}</h2>
          <p>{t('auth.editDescription')}</p>
        </div>
        <button className="modal-close" type="button" onClick={onClose} aria-label={t('common.close')} disabled={busy}>
          <Icon name="close" />
        </button>
      </div>

      <form className="signup-form" onSubmit={submit}>
        <div className="signup-basic-fields">
          <label>
            <span>{t('auth.name')}</span>
            <input name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          </label>
          <label>
            <span>{t('auth.email')}</span>
            <input type="email" value={user.email} readOnly aria-describedby={emailHintId} />
            <small id={emailHintId}>{t('auth.emailImmutable')}</small>
          </label>
        </div>

        <RegionSelector
          title={t('region.interest')}
          inputName="regionIds"
          initialSelections={initialRegions}
          maxSelections={1}
          onSelectionChange={setRegionIds}
        />

        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="signup-actions">
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="accent-button" type="submit" disabled={busy || !name.trim() || regionIds.length === 0}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
