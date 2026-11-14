import { useEffect, useId, useState } from 'react'
import { Icon } from './Icon'
import { RegionSelector } from './RegionSelector'

// API 연결 전 회원가입 폼에서 사용하는 예시 국가·행정구역 데이터입니다.
const SIGNUP_FORM_DATA = {
  title: '회원가입',
  description: '기본 정보와 관심 지역을 설정해 주세요.',
  countries: [
    { code: 'KR', name: '대한민국' },
    { code: 'US', name: '미국' },
    { code: 'JP', name: '일본' },
    { code: 'CN', name: '중국' },
    { code: 'AU', name: '호주' },
    { code: 'BR', name: '브라질' },
  ],
}

type SignupModalProps = {
  open: boolean
  onClose: () => void
}

export function SignupModal({ open, onClose }: SignupModalProps) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [nationalityCode, setNationalityCode] = useState('KR')

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="signup-modal-head">
          <div>
            <span className="modal-eyebrow">Google 계정으로 시작하기</span>
            <h2 id={titleId}>{SIGNUP_FORM_DATA.title}</h2>
            <p>{SIGNUP_FORM_DATA.description}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기"><Icon name="close" /></button>
        </div>

        <form className="signup-form" onSubmit={(event) => { event.preventDefault(); onClose() }}>
          <div className="signup-basic-fields">
            <label>
              <span>이름</span>
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="이름을 입력하세요" maxLength={100} required />
            </label>
            <label>
              <span>이메일</span>
              <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" maxLength={255} required />
            </label>
            <label>
              <span>국적</span>
              <select name="nationality_code" value={nationalityCode} onChange={(event) => setNationalityCode(event.target.value)} required>
                {SIGNUP_FORM_DATA.countries.map((country) => <option value={country.code} key={country.code}>{country.name} ({country.code})</option>)}
              </select>
            </label>
          </div>

          <RegionSelector title="관심 지역" inputName="region_ids" maxSelections={5} />

          <div className="signup-actions">
            <button className="quiet-button" type="button" onClick={onClose}>취소</button>
            <button className="accent-button" type="submit">회원가입</button>
          </div>
        </form>
      </section>
    </div>
  )
}
