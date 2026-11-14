import { useEffect, useState } from 'react'
import {
  AuthRequestError, GOOGLE_LOGIN_URL,
  type ProfileDetails, type SignupDetails,
} from '../api/auth'
import {
  useAccountQuery, useCompleteSignupMutation,
  useLogoutMutation, useUpdateProfileMutation,
} from '../api/authQueries'
import { EditProfileModal } from '../components/EditProfileModal'
import { GoogleLoginButton } from '../components/GoogleLoginButton'
import { KoreaMap, type MapSelection } from '../components/KoreaMap'
import { SignupModal } from '../components/SignupModal'
import './DocumentMap.css'

const MOCK_FEATURES = [
  { id: 'season', number: '01', name: '계절별 비교', description: '계절에 따른 관측 데이터 비교' },
  { id: 'period', number: '02', name: '기간별 추이', description: '선택 기간의 시간 흐름 살펴보기' },
  { id: 'daynight', number: '03', name: '낮과 밤 비교', description: '관측 시간대별 데이터 비교' },
] as const

type Step = 'home' | 'region' | 'features'

function signupError(error: Error | null) {
  if (error instanceof AuthRequestError && error.status === 401) {
    return '가입 세션이 만료되었습니다. Google로 다시 로그인해 주세요.'
  }
  if (error instanceof AuthRequestError && error.status === 409) {
    return '이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.'
  }
  return error ? '회원가입을 완료하지 못했습니다. 입력값을 확인해 주세요.' : ''
}

export default function AuthHome() {
  const [editingProfile, setEditingProfile] = useState(false)
  const [step, setStep] = useState<Step>('home')
  const [selecting, setSelecting] = useState(false)
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.' : '',
  )
  const accountQuery = useAccountQuery()
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const profileMutation = useUpdateProfileMutation()
  const account = accountQuery.data ?? null
  const pendingSignup = account && 'registrationRequired' in account ? account : null
  const user = account && 'id' in account ? account : null
  const busy = accountQuery.isPending || signupMutation.isPending
    || logoutMutation.isPending || profileMutation.isPending
  const error = redirectError
    || (accountQuery.error ? '로그인 상태를 확인하지 못했습니다.' : '')
    || signupError(signupMutation.error)
    || (logoutMutation.error ? '로그아웃에 실패했습니다.' : '')

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('login') === 'failed') {
      url.searchParams.delete('login')
      window.history.replaceState(null, '', url)
    }
  }, [])

  function login() {
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.reset()
    const loginUrl = new URL(GOOGLE_LOGIN_URL, window.location.href)
    // Local OAuth returns to localhost:8080, so its session cookie must be issued on localhost.
    if (import.meta.env.DEV && loginUrl.hostname === '127.0.0.1') {
      loginUrl.hostname = 'localhost'
    }
    window.location.assign(loginUrl.toString())
  }

  function logout() {
    setEditingProfile(false)
    setStep('home')
    setSelecting(false)
    setSelection(null)
    setSelectedFeatures([])
    setRedirectError('')
    signupMutation.reset()
    logoutMutation.mutate()
  }

  function saveProfile(details: ProfileDetails) {
    profileMutation.mutate(details, { onSuccess: () => setEditingProfile(false) })
  }

  function goBack() {
    if (step === 'features') {
      setStep('region')
      return
    }
    setStep('home')
    setSelecting(false)
    setSelection(null)
    setSelectedFeatures([])
  }

  function toggleFeature(id: string) {
    setSelectedFeatures((current) => current.includes(id)
      ? current.filter((feature) => feature !== id) : [...current, id])
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="작업 메뉴">
        <a href="/" className="workspace-brand" aria-label="FireScope 홈">
          <span className="workspace-brand-mark" aria-hidden="true">F</span>
          <span>FireScope<small>KOREA DATA STUDIO</small></span>
        </a>
        <div className="workspace-divider" />
        {step === 'home' ? <>
          <div className="workspace-sidebar-content">
            <span className="workspace-kicker">WORKSPACE / 00</span>
            <h1>데이터를 고르고,<br />문서로 정리하세요.</h1>
            <p>대한민국 지도에서 원하는 지역을 정하고 문서에 담을 데이터를 선택합니다.</p>
            <button className="workspace-primary" type="button" disabled={!user || busy}
              onClick={() => setStep('region')}>
              문서 생성 <span aria-hidden="true">↗</span>
            </button>
            {!user && <small className="workspace-help">Google 로그인 후 문서를 생성할 수 있습니다.</small>}
          </div>
          <div className="workspace-auth">
            <span className="workspace-small-label">ACCOUNT</span>
            {user ? <>
              <strong title={user.email}>{user.name}</strong>
              <button type="button" onClick={() => { profileMutation.reset(); setEditingProfile(true) }} disabled={busy}>회원정보 수정</button>
              <button type="button" onClick={logout} disabled={busy}>로그아웃</button>
            </> : <GoogleLoginButton onClick={login} disabled={busy} />}
            {error && !pendingSignup && <p className="auth-error" role="alert">{error}</p>}
          </div>
        </> : <>
          <button className="workspace-back" type="button" onClick={goBack}><span aria-hidden="true">←</span> 이전</button>
          <div className="workspace-sidebar-content">
            <span className="workspace-kicker">DOCUMENT / {step === 'region' ? '01' : '02'}</span>
            <div className="workspace-step-track" aria-label="문서 생성 단계">
              <span className="is-current">지역 선택</span><i /><span className={step === 'features' ? 'is-current' : ''}>기능 선택</span>
            </div>
            {step === 'region' ? <>
              <h1>문서의 지역을<br />선택하세요.</h1>
              <p>지도를 확대·이동한 다음, 지역 선택을 눌러 지도 위에 직사각형을 그려 주세요.</p>
              <button className={`workspace-select${selecting ? ' is-selecting' : ''}`} type="button"
                aria-pressed={selecting} onClick={() => setSelecting((current) => !current)}>
                <span aria-hidden="true">▣</span> {selecting ? '지도에서 드래그하세요' : selection ? '영역 다시 선택' : '지역 선택'}
              </button>
              {selection && <div className="workspace-selection-summary" role="status">
                <span>선택된 영역</span>
                <strong>위도 {selection.south.toFixed(2)}°–{selection.north.toFixed(2)}°</strong>
                <strong>경도 {selection.west.toFixed(2)}°–{selection.east.toFixed(2)}°</strong>
              </div>}
              <button className="workspace-primary" type="button" disabled={!selection}
                onClick={() => { setSelecting(false); setStep('features') }}>
                다음 <span aria-hidden="true">→</span>
              </button>
              {!selection && <small className="workspace-help">영역을 선택하면 다음 단계로 이동할 수 있습니다.</small>}
            </> : <>
              <h1>문서에 담을<br />기능을 선택하세요.</h1>
              <p>기능 목록은 임시 예시입니다. 실제 문서 항목은 추후 연결됩니다.</p>
              <div className="workspace-selection-summary">
                <span>선택된 영역</span>
                <strong>{selection ? `위도 ${selection.south.toFixed(2)}°–${selection.north.toFixed(2)}°` : '없음'}</strong>
                <strong>{selection ? `경도 ${selection.west.toFixed(2)}°–${selection.east.toFixed(2)}°` : ''}</strong>
              </div>
            </>}
          </div>
        </>}
        <div className="workspace-sidebar-foot">FIRESCOPE · SOUTH KOREA</div>
      </aside>

      <main className="workspace-main">
        {step === 'features' ? <div className="workspace-features">
          <div className="workspace-main-heading"><span>02 / DOCUMENT CONTENT</span><strong>문서 구성</strong></div>
          <div className="workspace-features-intro"><span>STEP 02</span><h2>어떤 데이터를 담을까요?</h2>
            <p>선택한 지역을 기준으로 문서에 추가할 항목을 고릅니다. 아래 항목은 화면 확인을 위한 예시입니다.</p></div>
          <div className="workspace-feature-grid">{MOCK_FEATURES.map((feature) => (
            <label key={feature.id} className={`workspace-feature-card${selectedFeatures.includes(feature.id) ? ' is-selected' : ''}`}>
              <input type="checkbox" checked={selectedFeatures.includes(feature.id)} onChange={() => toggleFeature(feature.id)} />
              <span className="workspace-feature-number">{feature.number} / MOCK</span>
              <span className="workspace-feature-symbol" aria-hidden="true">{feature.id === 'season' ? '◐' : feature.id === 'period' ? '▥' : '☼'}</span>
              <strong>{feature.name}</strong><small>{feature.description}</small>
              <span className="workspace-feature-check" aria-hidden="true">✓</span>
            </label>
          ))}</div>
          <div className="workspace-features-foot"><strong>{selectedFeatures.length}개 항목 선택</strong><span>문서 추출은 이후 단계에서 연결됩니다.</span></div>
        </div> : <div className="workspace-map-page">
          <div className="workspace-main-heading"><span>01 / REGION CANVAS</span><strong>대한민국 지도</strong></div>
          <div className="workspace-map-stage">
            <div className="workspace-map-grid" aria-hidden="true" />
            <KoreaMap key={step === 'home' ? 'home' : 'document'} active={step === 'region'} selecting={selecting} selection={selection}
              onSelect={(area) => { setSelection(area); setSelecting(false) }} />
            <div className="workspace-map-corner workspace-map-corner-top">37° N <i /> 127° E</div>
            <div className="workspace-map-attribution">
              <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOxCloudless</a> by EOX IT Services GmbH
              <span>(Contains modified Copernicus Sentinel data 2016 &amp; 2017)</span>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
              <span>· Boundaries:</span>
              <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a>
            </div>
            <div className="workspace-map-corner workspace-map-corner-bottom">KOREA / WGS 84</div>
          </div>
          <div className="workspace-map-footer"><span><i /> 대한민국 전역</span>
            <p>{step === 'home' ? '문서 생성을 누르면 지도를 확대하고 지역을 선택할 수 있습니다.'
              : selecting ? '드래그해서 직사각형 영역을 지정하세요.' : '마우스 휠로 확대하고, 드래그해서 지도를 이동하세요.'}</p>
            <span>{step === 'home' ? '지도 잠김' : '지도 탐색 가능'}</span>
          </div>
        </div>}
      </main>
      {pendingSignup && <SignupModal profile={pendingSignup} busy={busy} error={error}
        onClose={logout} onSubmit={(details: SignupDetails) => signupMutation.mutate(details)} />}
      {user && editingProfile && <EditProfileModal user={user} busy={profileMutation.isPending}
        error={profileMutation.error ? '회원정보를 저장하지 못했습니다.' : ''}
        onClose={() => setEditingProfile(false)} onSubmit={saveProfile} />}
    </div>
  )
}
