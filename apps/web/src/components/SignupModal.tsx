import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { PendingSignup, SignupDetails } from '../api/auth'
import { useRegionsQuery } from '../api/regionQueries'
import { Icon } from './Icon'
import { RegionSelector } from './RegionSelector'
import { SearchableSelect } from './SearchableSelect'

type SignupModalProps = {
  profile: PendingSignup
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (details: SignupDetails) => void
}

export function SignupModal({ profile, busy, error, onClose, onSubmit }: SignupModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const emailHintId = useId()
  const [name, setName] = useState(() => profile.name?.slice(0, 100) ?? '')
  const [nationalityCode, setNationalityCode] = useState('')
  const [regionIds, setRegionIds] = useState<number[]>([])
  const countriesQuery = useRegionsQuery(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && name.trim() && nationalityCode && regionIds.length > 0) {
      onSubmit({ name: name.trim(), nationalityCode, regionIds })
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
          <h2 id={titleId}>회원가입</h2>
          <p>이름과 국적을 확인해 가입을 완료하세요.</p>
        </div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기" disabled={busy}>
          <Icon name="close" />
        </button>
      </div>

      <form className="signup-form" onSubmit={submit}>
        <div className="signup-basic-fields">
          <label>
            <span>이름</span>
            <input name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          </label>
          <label>
            <span>이메일</span>
            <input type="email" value={profile.email} readOnly aria-describedby={emailHintId} />
            <small id={emailHintId}>Google에서 확인한 이메일입니다.</small>
          </label>
          <label>
            <span>국적</span>
            <SearchableSelect
              name="nationalityCode"
              value={nationalityCode}
              options={countriesQuery.data?.map(({ name, countryCode }) => ({
                value: countryCode,
                label: `${name} (${countryCode})`,
              })) ?? []}
              placeholder={countriesQuery.isPending
                ? '불러오는 중…'
                : countriesQuery.isError
                  ? '국가 불러오기 실패'
                  : '국적 검색'}
              disabled={countriesQuery.isPending || countriesQuery.isError}
              onChange={setNationalityCode}
            />
          </label>
        </div>

        <RegionSelector
          title="관심 지역"
          inputName="regionIds"
          maxSelections={5}
          onSelectionChange={setRegionIds}
        />

        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="signup-actions">
          <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>취소</button>
          <button className="accent-button" type="submit" disabled={busy || !name.trim() || !nationalityCode || regionIds.length === 0}>
            {busy ? '처리 중…' : '회원가입'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
