import { useCallback, useEffect, useState } from 'react'
import {
  AuthRequestError, GOOGLE_LOGIN_URL,
  type ProfileDetails, type SignupDetails,
} from '../api/auth'
import {
  useAccountQuery, useCompleteSignupMutation,
  useLogoutMutation, useUpdateProfileMutation,
} from '../api/authQueries'
import { useFeaturesQuery } from '../api/featureQueries'
import type {
  ConfidenceConfig, FirePointsConfig, FireSummaryConfig, MonthlyTrendConfig,
} from '../api/fireData'
import { useChildRegionMapsQuery, useRegionMapQuery, useRegionsQuery } from '../api/regionQueries'
import { EditProfileModal } from '../components/EditProfileModal'
import { BrandLogo } from '../components/BrandLogo'
import { GoogleLoginButton } from '../components/GoogleLoginButton'
import { FireSummaryPreviewModal } from '../components/FireSummaryPreviewModal'
import {
  ConfidencePreviewModal, FirePointsPreviewModal, MonthlyTrendPreviewModal,
} from '../components/FireFeaturePreviewModals'
import { KoreaMap, type MapSelection } from '../components/KoreaMap'
import { MapRegionSearch } from '../components/MapRegionSearch'
import { SignupModal } from '../components/SignupModal'
import type { RegionMap } from '../api/regions'
import './DocumentMap.css'

type Step = 'home' | 'region' | 'features'

const FEATURE_SYMBOLS: Record<string, string> = {
  FIRE_SUMMARY: '◫',
  FIRE_LOCATION_MAP: '⌖',
  MONTHLY_FIRE_TREND: '▥',
  CONFIDENCE_ANALYSIS: '◉',
}

function periodAt(offsetFromLatestCompleteMonth: number) {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 1 + offsetFromLatestCompleteMonth, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const DEFAULT_SUMMARY_CONFIG: FireSummaryConfig = {
  fromPeriod: periodAt(-11),
  toPeriod: periodAt(0),
  sensor: 'ALL',
  confidenceLevel: 'ALL',
}
const DEFAULT_POINTS_CONFIG: FirePointsConfig = {
  period: periodAt(0), sensor: 'ALL', confidenceLevel: 'ALL',
}
const DEFAULT_MONTHLY_CONFIG: MonthlyTrendConfig = {
  fromPeriod: periodAt(-11), toPeriod: periodAt(0), sensor: 'ALL', metric: 'observationCount',
}
const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  fromPeriod: periodAt(-11), toPeriod: periodAt(0), sensor: 'ALL',
}

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
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [focusedRegion, setFocusedRegion] = useState<RegionMap | null>(null)
  const [mapCityId, setMapCityId] = useState(0)
  const [mapDistrictId, setMapDistrictId] = useState(0)
  const [selectedFeatures, setSelectedFeatures] = useState<number[]>([])
  const [summaryConfig, setSummaryConfig] = useState<FireSummaryConfig>(DEFAULT_SUMMARY_CONFIG)
  const [pointsConfig, setPointsConfig] = useState<FirePointsConfig>(DEFAULT_POINTS_CONFIG)
  const [monthlyConfig, setMonthlyConfig] = useState<MonthlyTrendConfig>(DEFAULT_MONTHLY_CONFIG)
  const [confidenceConfig, setConfidenceConfig] = useState<ConfidenceConfig>(DEFAULT_CONFIDENCE_CONFIG)
  const [previewFeatureCode, setPreviewFeatureCode] = useState<string | null>(null)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.' : '',
  )
  const accountQuery = useAccountQuery()
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const profileMutation = useUpdateProfileMutation()
  const countriesQuery = useRegionsQuery(null)
  const korea = countriesQuery.data?.find((region) =>
    region.countryCode === 'KR' && region.level === 0)
  const countryMapQuery = useRegionMapQuery(korea?.id ?? null)
  const provinceRegionsQuery = useChildRegionMapsQuery(korea?.id ?? null)
  const featuresQuery = useFeaturesQuery(step === 'features')
  const mapLayerParentId = focusedRegion?.level === 1
    ? focusedRegion.id
    : focusedRegion?.level === 2
      ? focusedRegion.parentId
      : korea?.id ?? null
  const mapRegionsQuery = useChildRegionMapsQuery(mapLayerParentId, step === 'region')
  const selectedCityName = selection?.regionLevel === 1
    ? selection.regionName
    : provinceRegionsQuery.data?.find((region) => region.id === mapCityId)?.name
  const selectedDistrictName = selection?.regionLevel === 2 ? selection.regionName : '전체'
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
    setSelection(null)
    setFocusedRegion(null)
    setMapCityId(0)
    setMapDistrictId(0)
    setSelectedFeatures([])
    setPreviewFeatureCode(null)
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
    setSelection(null)
    setFocusedRegion(null)
    setMapCityId(0)
    setMapDistrictId(0)
    setSelectedFeatures([])
    setPreviewFeatureCode(null)
  }

  function toggleFeature(id: number) {
    if (selectedFeatures.includes(id)) setPreviewFeatureCode(null)
    setSelectedFeatures((current) => current.includes(id)
      ? current.filter((feature) => feature !== id) : [...current, id])
  }

  const focusAdministrativeRegion = useCallback((region: RegionMap) => {
    setFocusedRegion(region)
    setSelection({
      regionId: region.id,
      regionName: region.name,
      regionLevel: region.level,
    })
  }, [])

  const clickAdministrativeRegion = useCallback((region: RegionMap) => {
    if (region.level === 1) {
      setMapCityId(region.id)
      setMapDistrictId(0)
    } else if (region.level === 2) {
      setMapCityId(region.parentId ?? 0)
      setMapDistrictId(region.id)
    }
    focusAdministrativeRegion(region)
  }, [focusAdministrativeRegion])

  function resetRegionSelection() {
    setFocusedRegion(null)
    setSelection(null)
    setMapCityId(0)
    setMapDistrictId(0)
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="작업 메뉴">
        <a href="/" className="workspace-brand" aria-label="산불24 홈">
          <BrandLogo className="workspace-brand-logo" />
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
              <p>시·도와 시·군·구를 검색하면 지도가 해당 행정구역으로 이동합니다.</p>
              <MapRegionSearch cityId={mapCityId} districtId={mapDistrictId} canReset={Boolean(selection)}
                onCityChange={(regionId) => {
                  setMapCityId(regionId)
                  setMapDistrictId(0)
                  if (!regionId) { setFocusedRegion(null); setSelection(null) }
                }}
                onDistrictChange={setMapDistrictId}
                onRegionFocus={focusAdministrativeRegion}
                onReset={resetRegionSelection} />
              {selection && <div className="workspace-selection-summary" role="status">
                <span>선택된 행정구역</span>
                <div><small>시·도</small><strong>{selectedCityName ?? '-'}</strong></div>
                <div><small>시·군·구</small><strong>{selectedDistrictName}</strong></div>
              </div>}
              <button className="workspace-primary" type="button" disabled={!selection}
                onClick={() => setStep('features')}>
                다음 <span aria-hidden="true">→</span>
              </button>
              {!selection && <small className="workspace-help">영역을 선택하면 다음 단계로 이동할 수 있습니다.</small>}
            </> : <>
              <h1>문서에 담을<br />기능을 선택하세요.</h1>
              <p>기능을 선택하고 각 카드에서 조회 조건을 설정한 뒤 데이터를 미리 확인할 수 있습니다.</p>
              <div className="workspace-selection-summary">
                <span>선택된 행정구역</span>
                <div><small>시·도</small><strong>{selectedCityName ?? '-'}</strong></div>
                <div><small>시·군·구</small><strong>{selection ? selectedDistrictName : '-'}</strong></div>
              </div>
            </>}
          </div>
        </>}
        <div className="workspace-sidebar-foot">산불24 · SOUTH KOREA</div>
      </aside>

      <main className="workspace-main">
        {step === 'features' ? <div className="workspace-features">
          <div className="workspace-main-heading"><span>02 / DOCUMENT CONTENT</span><strong>문서 구성</strong></div>
          <div className="workspace-features-intro"><span>STEP 02</span><h2>어떤 데이터를 담을까요?</h2>
            <p>선택한 지역을 기준으로 문서에 추가할 화재 관측 데이터 항목을 선택합니다.</p></div>
          {featuresQuery.isPending && <p className="workspace-feature-state" role="status">기능 목록을 불러오는 중입니다…</p>}
          {featuresQuery.isError && <p className="workspace-feature-error" role="alert">기능 목록을 불러오지 못했습니다.</p>}
          <div className="workspace-feature-grid">{featuresQuery.data?.map((feature, index) => {
            const selected = selectedFeatures.includes(feature.id)
            const isSummary = feature.code === 'FIRE_SUMMARY'
            const isPoints = feature.code === 'FIRE_LOCATION_MAP'
            const isMonthly = feature.code === 'MONTHLY_FIRE_TREND'
            const isConfidence = feature.code === 'CONFIDENCE_ANALYSIS'
            const hasSettings = isSummary || isPoints || isMonthly || isConfidence
            const invalidPeriod = isMonthly
              ? monthlyConfig.fromPeriod > monthlyConfig.toPeriod
              : isConfidence
                ? confidenceConfig.fromPeriod > confidenceConfig.toPeriod
                : summaryConfig.fromPeriod > summaryConfig.toPeriod
            return <article key={feature.id} className={`workspace-feature-card${selected ? ' is-selected' : ''}${selected && hasSettings ? ' has-settings' : ''}`}>
              <label className="workspace-feature-toggle">
                <input type="checkbox" checked={selected} onChange={() => toggleFeature(feature.id)} />
                <span className="workspace-feature-number">{String(index + 1).padStart(2, '0')} / FIRE DATA</span>
                <span className="workspace-feature-symbol" aria-hidden="true">{FEATURE_SYMBOLS[feature.code] ?? '◇'}</span>
                <strong>{feature.name}</strong><small>{feature.description}</small>
                <span className="workspace-feature-check" aria-hidden="true">✓</span>
              </label>
              {selected && isSummary && <div className="workspace-feature-settings">
                <div className="workspace-feature-fields">
                  <label><span>시작 월</span><input type="month" value={summaryConfig.fromPeriod}
                    onChange={(event) => setSummaryConfig((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
                  <label><span>종료 월</span><input type="month" value={summaryConfig.toPeriod}
                    onChange={(event) => setSummaryConfig((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
                  <label><span>센서</span><select value={summaryConfig.sensor}
                    onChange={(event) => setSummaryConfig((current) => ({ ...current, sensor: event.target.value as FireSummaryConfig['sensor'] }))}>
                    <option value="ALL">전체</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
                  </select></label>
                  <label><span>신뢰도</span><select value={summaryConfig.confidenceLevel}
                    onChange={(event) => setSummaryConfig((current) => ({ ...current, confidenceLevel: event.target.value as FireSummaryConfig['confidenceLevel'] }))}>
                    <option value="ALL">전체</option><option value="high">high</option>
                    <option value="nominal">nominal</option><option value="low">low</option>
                  </select></label>
                </div>
                {invalidPeriod && <small className="workspace-feature-validation" role="alert">시작 월은 종료 월보다 늦을 수 없습니다.</small>}
                <button className="workspace-preview-button" type="button" disabled={invalidPeriod || !selection}
                  onClick={() => setPreviewFeatureCode(feature.code)}>데이터 미리보기 <span aria-hidden="true">↗</span></button>
              </div>}
              {selected && isPoints && <div className="workspace-feature-settings">
                <div className="workspace-feature-fields">
                  <label><span>조회 월</span><input type="month" value={pointsConfig.period}
                    onChange={(event) => setPointsConfig((current) => ({ ...current, period: event.target.value }))} /></label>
                  <label><span>센서</span><select value={pointsConfig.sensor}
                    onChange={(event) => setPointsConfig((current) => ({ ...current, sensor: event.target.value as FirePointsConfig['sensor'] }))}>
                    <option value="ALL">전체</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
                  </select></label>
                  <label><span>신뢰도</span><select value={pointsConfig.confidenceLevel}
                    onChange={(event) => setPointsConfig((current) => ({ ...current, confidenceLevel: event.target.value as FirePointsConfig['confidenceLevel'] }))}>
                    <option value="ALL">전체</option><option value="high">high</option><option value="nominal">nominal</option><option value="low">low</option>
                  </select></label>
                </div>
                <button className="workspace-preview-button" type="button" disabled={!pointsConfig.period || !selection}
                  onClick={() => setPreviewFeatureCode(feature.code)}>데이터 미리보기 <span aria-hidden="true">↗</span></button>
              </div>}
              {selected && isMonthly && <div className="workspace-feature-settings">
                <div className="workspace-feature-fields">
                  <label><span>시작 월</span><input type="month" value={monthlyConfig.fromPeriod}
                    onChange={(event) => setMonthlyConfig((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
                  <label><span>종료 월</span><input type="month" value={monthlyConfig.toPeriod}
                    onChange={(event) => setMonthlyConfig((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
                  <label><span>센서</span><select value={monthlyConfig.sensor}
                    onChange={(event) => setMonthlyConfig((current) => ({ ...current, sensor: event.target.value as MonthlyTrendConfig['sensor'] }))}>
                    <option value="ALL">전체</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
                  </select></label>
                  <label><span>표시 지표</span><select value={monthlyConfig.metric}
                    onChange={(event) => setMonthlyConfig((current) => ({ ...current, metric: event.target.value as MonthlyTrendConfig['metric'] }))}>
                    <option value="observationCount">관측 건수</option><option value="totalFrp">전체 FRP</option><option value="averageFrp">평균 FRP</option>
                  </select></label>
                </div>
                {invalidPeriod && <small className="workspace-feature-validation" role="alert">시작 월은 종료 월보다 늦을 수 없습니다.</small>}
                <button className="workspace-preview-button" type="button" disabled={invalidPeriod || !selection}
                  onClick={() => setPreviewFeatureCode(feature.code)}>데이터 미리보기 <span aria-hidden="true">↗</span></button>
              </div>}
              {selected && isConfidence && <div className="workspace-feature-settings">
                <div className="workspace-feature-fields">
                  <label><span>시작 월</span><input type="month" value={confidenceConfig.fromPeriod}
                    onChange={(event) => setConfidenceConfig((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
                  <label><span>종료 월</span><input type="month" value={confidenceConfig.toPeriod}
                    onChange={(event) => setConfidenceConfig((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
                  <label><span>센서</span><select value={confidenceConfig.sensor}
                    onChange={(event) => setConfidenceConfig((current) => ({ ...current, sensor: event.target.value as ConfidenceConfig['sensor'] }))}>
                    <option value="ALL">전체</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
                  </select></label>
                </div>
                {invalidPeriod && <small className="workspace-feature-validation" role="alert">시작 월은 종료 월보다 늦을 수 없습니다.</small>}
                <button className="workspace-preview-button" type="button" disabled={invalidPeriod || !selection}
                  onClick={() => setPreviewFeatureCode(feature.code)}>데이터 미리보기 <span aria-hidden="true">↗</span></button>
              </div>}
            </article>
          })}</div>
          <div className="workspace-features-foot"><strong>{selectedFeatures.length}개 항목 선택</strong><span>DB에 등록된 활성 기능만 표시됩니다.</span></div>
        </div> : <div className="workspace-map-page">
          <div className="workspace-main-heading"><span>01 / REGION CANVAS</span><strong>대한민국 지도</strong></div>
          <div className="workspace-map-stage">
            <div className="workspace-map-grid" aria-hidden="true" />
            <KoreaMap key={`${step === 'home' ? 'home' : 'document'}-${focusedRegion?.id ?? 'all'}`} active={step === 'region'}
              countryRegion={countryMapQuery.data ?? null}
              provinceRegions={provinceRegionsQuery.data ?? []}
              focusRegion={focusedRegion} mapRegions={mapRegionsQuery.data ?? []}
              onRegionClick={clickAdministrativeRegion} />
            <div className="workspace-map-corner workspace-map-corner-top">37° N <i /> 127° E</div>
            <div className="workspace-map-attribution">
              <span>행정구역 경계:</span>
              <a href="https://www.vworld.kr" target="_blank" rel="noopener noreferrer">국가공간정보포털 V-World</a>
              <span>· WGS 84</span>
            </div>
            <div className="workspace-map-corner workspace-map-corner-bottom">KOREA / WGS 84</div>
          </div>
          <div className="workspace-map-footer"><span><i /> 대한민국 전역</span>
            <p>{step === 'home' ? '문서 생성을 누르면 지도를 확대하고 지역을 선택할 수 있습니다.'
              : mapRegionsQuery.isPending ? '행정구역 경계를 불러오는 중입니다.'
                  : focusedRegion?.level === 1 ? `${focusedRegion.name} 안의 시·군·구를 클릭하세요.`
                    : focusedRegion?.level === 2 ? `${focusedRegion.name} 행정구역으로 이동했습니다.`
                      : '행정구역을 검색하거나 지도에서 직접 클릭하세요.'}</p>
            <span>{step === 'home' ? '지도 잠김' : '지도 탐색 가능'}</span>
          </div>
        </div>}
      </main>
      {pendingSignup && <SignupModal profile={pendingSignup} busy={busy} error={error}
        onClose={logout} onSubmit={(details: SignupDetails) => signupMutation.mutate(details)} />}
      {user && editingProfile && <EditProfileModal user={user} busy={profileMutation.isPending}
        error={profileMutation.error ? '회원정보를 저장하지 못했습니다.' : ''}
        onClose={() => setEditingProfile(false)} onSubmit={saveProfile} />}
      {selection && previewFeatureCode === 'FIRE_SUMMARY' && <FireSummaryPreviewModal
        regionId={selection.regionId} regionName={selection.regionName} config={summaryConfig}
        onClose={() => setPreviewFeatureCode(null)} />}
      {selection && previewFeatureCode === 'FIRE_LOCATION_MAP' && <FirePointsPreviewModal
        regionId={selection.regionId} regionName={selection.regionName} config={pointsConfig}
        onClose={() => setPreviewFeatureCode(null)} />}
      {selection && previewFeatureCode === 'MONTHLY_FIRE_TREND' && <MonthlyTrendPreviewModal
        regionId={selection.regionId} regionName={selection.regionName} config={monthlyConfig}
        onClose={() => setPreviewFeatureCode(null)} />}
      {selection && previewFeatureCode === 'CONFIDENCE_ANALYSIS' && <ConfidencePreviewModal
        regionId={selection.regionId} regionName={selection.regionName} config={confidenceConfig}
        onClose={() => setPreviewFeatureCode(null)} />}
    </div>
  )
}
