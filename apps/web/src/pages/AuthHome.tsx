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
import { useChildRegionMapsQuery, useRegionsQuery } from '../api/regionQueries'
import { EditProfileModal } from '../components/EditProfileModal'
import { DocumentHistoryModal } from '../components/DocumentHistoryModal'
import { DocumentPreviewModal } from '../components/DocumentPreviewModal'
import { PublicDocumentSearchModal } from '../components/PublicDocumentSearchModal'
import { GoogleLoginButton } from '../components/GoogleLoginButton'
import { Icon } from '../components/Icon'
import { KoreaMap, SatelliteMapAttribution, type MapSelection } from '../components/KoreaMap'
import { FireTimelapseLabel } from '../components/FireTimelapse'
import { useFireTimelapse } from '../api/fireTimelapse'
import { MapRegionSearch } from '../components/MapRegionSearch'
import { SignupModal } from '../components/SignupModal'
import type { RegionMap } from '../api/regions'
import { FeaturePreviewLayer } from '../features/document/components/FeaturePreviewLayer'
import { FeatureSelectionPanel } from '../features/document/components/FeatureSelectionPanel'
import { PortalHeader } from '../features/document/components/PortalHeader'
import {
  DEFAULT_CONFIDENCE_CONFIG,
  DEFAULT_HOTSPOT_CONFIG,
  DEFAULT_MONTHLY_CONFIG,
  DEFAULT_PERIOD_ANALYSIS_CONFIG,
  DEFAULT_POINTS_CONFIG,
  DEFAULT_SUMMARY_CONFIG,
  DOCUMENT_STEPS,
  periodAt,
  type DocumentFeatureConfigs,
} from '../features/document/documentConfig'
import './DocumentMap.css'

type Step = 'home' | 'region' | 'features'
const AUTH_FEATURES_ENABLED = false

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
  const [selectingArea, setSelectingArea] = useState(false)
  const [focusedRegion, setFocusedRegion] = useState<RegionMap | null>(null)
  const [mapCityId, setMapCityId] = useState(0)
  const [mapDistrictId, setMapDistrictId] = useState(0)
  const [selectedFeatures, setSelectedFeatures] = useState<number[]>([])
  const [summaryConfig, setSummaryConfig] = useState(DEFAULT_SUMMARY_CONFIG)
  const [pointsConfig, setPointsConfig] = useState(DEFAULT_POINTS_CONFIG)
  const [monthlyConfig, setMonthlyConfig] = useState(DEFAULT_MONTHLY_CONFIG)
  const [confidenceConfig, setConfidenceConfig] = useState(DEFAULT_CONFIDENCE_CONFIG)
  const [nearestPeriod, setNearestPeriod] = useState({ fromPeriod: periodAt(-11), toPeriod: periodAt(0) })
  const [intensityConfig, setIntensityConfig] = useState(DEFAULT_PERIOD_ANALYSIS_CONFIG)
  const [dayNightConfig, setDayNightConfig] = useState(DEFAULT_PERIOD_ANALYSIS_CONFIG)
  const [comparisonConfig, setComparisonConfig] = useState(DEFAULT_PERIOD_ANALYSIS_CONFIG)
  const [hotspotConfig, setHotspotConfig] = useState(DEFAULT_HOTSPOT_CONFIG)
  const [previewFeatureCode, setPreviewFeatureCode] = useState<string | null>(null)
  const [documentName, setDocumentName] = useState('산불 관측 분석 문서')
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false)
  const [documentHistoryOpen, setDocumentHistoryOpen] = useState(false)
  const [publicDocumentSearchOpen, setPublicDocumentSearchOpen] = useState(false)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? 'Google 로그인에 실패했습니다. 다시 시도해 주세요.' : '',
  )
  const accountQuery = useAccountQuery(AUTH_FEATURES_ENABLED)
  const signupMutation = useCompleteSignupMutation()
  const logoutMutation = useLogoutMutation()
  const profileMutation = useUpdateProfileMutation()
  const countriesQuery = useRegionsQuery(null)
  const korea = countriesQuery.data?.find((region) =>
    region.countryCode === 'KR' && region.level === 0)
  const provinceRegionsQuery = useRegionsQuery(korea?.id ?? null, Boolean(korea))
  const featuresQuery = useFeaturesQuery(step === 'features')
  const timelapse = useFireTimelapse(step === 'home')
  const mapLayerParentId = focusedRegion?.level === 1
    ? focusedRegion.id
    : focusedRegion?.level === 2
      ? focusedRegion.parentId
      : korea?.id ?? null
  const mapRegionsQuery = useChildRegionMapsQuery(mapLayerParentId, step === 'region')
  const selectedCityName = provinceRegionsQuery.data?.find((region) => region.id === mapCityId)?.name
  const selectedDistrictName = mapRegionsQuery.data?.find((region) => region.id === mapDistrictId)?.name
  const account = accountQuery.data ?? null
  const pendingSignup = account && 'registrationRequired' in account ? account : null
  const user = account && 'id' in account ? account : null
  const selectedFeatureOptions = featuresQuery.data?.filter((feature) => selectedFeatures.includes(feature.id)) ?? []
  const busy = AUTH_FEATURES_ENABLED && (accountQuery.isPending || signupMutation.isPending
    || logoutMutation.isPending || profileMutation.isPending)
  const error = AUTH_FEATURES_ENABLED ? redirectError
    || (accountQuery.error ? '로그인 상태를 확인하지 못했습니다.' : '')
    || signupError(signupMutation.error)
    || (logoutMutation.error ? '로그아웃에 실패했습니다.' : '') : ''

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
    setSelectingArea(false)
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
    goHome()
  }

  function goHome() {
    setStep('home')
    setSelection(null)
    setSelectingArea(false)
    setFocusedRegion(null)
    setMapCityId(0)
    setMapDistrictId(0)
    setSelectedFeatures([])
    setPreviewFeatureCode(null)
  }

  function toggleFeature(id: number) {
    if (selectedFeatures.includes(id)) setPreviewFeatureCode(null)
    setSelectedFeatures((current) => {
      if (current.includes(id)) return current.filter((feature) => feature !== id)
      return [...current, id]
    })
  }

  const focusAdministrativeRegion = useCallback((region: RegionMap) => {
    setFocusedRegion(region)
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
    setMapCityId(0)
    setMapDistrictId(0)
  }

  const stepIndex: number = step === 'home' ? -1 : step === 'region' ? 0 : documentPreviewOpen ? 2 : 1
  const featureConfigs: DocumentFeatureConfigs = {
    summary: summaryConfig,
    points: pointsConfig,
    monthly: monthlyConfig,
    confidence: confidenceConfig,
    nearest: nearestPeriod,
    intensity: intensityConfig,
    dayNight: dayNightConfig,
    comparison: comparisonConfig,
    hotspots: hotspotConfig,
  }

  return (
    <div className="portal">
      <PortalHeader showHomeButton={step !== 'home'}
        onOpenDocumentSearch={() => setPublicDocumentSearchOpen(true)} onGoHome={goHome} />

      <div className="portal-body" id="portal-main">
        <nav className="portal-breadcrumb" aria-label="현재 위치">
          <span>홈</span>
          <Icon name="chevron" size={14} />
          <span className={step === 'home' ? 'is-current' : ''}>산불 이력 확인서 발급</span>
          {stepIndex >= 0 && <><Icon name="chevron" size={14} /><span className="is-current">{DOCUMENT_STEPS[stepIndex]}</span></>}
        </nav>
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="작업 메뉴">
        {step === 'home' ? <>
          <div className="workspace-sidebar-content">
            <span className="workspace-kicker">산불 이력 확인서</span>
            <h1>데이터를 고르고,<br />문서로 정리하세요.</h1>
            <p>대한민국 지도에서 원하는 지역을 정하고 문서에 담을 데이터를 선택합니다.</p>
            <div className="workspace-services">
              <button className="workspace-service is-primary" type="button" disabled={AUTH_FEATURES_ENABLED && (!user || busy)}
                onClick={() => setStep('region')}>
                <span className="workspace-service-icon"><Icon name="file" size={24} /></span>
                <span className="workspace-service-text"><strong>문서 생성</strong><small>지역과 항목을 골라 확인서를 만듭니다</small></span>
                <Icon name="chevron" size={20} />
              </button>
              <button className="workspace-service" type="button" onClick={() => setPublicDocumentSearchOpen(true)}>
                <span className="workspace-service-icon"><Icon name="search" size={24} /></span>
                <span className="workspace-service-text"><strong>해시번호로 문서 찾기</strong><small>발급한 문서를 12자리 번호로 확인합니다</small></span>
                <Icon name="chevron" size={20} />
              </button>
            </div>
            <ol className="workspace-guide" aria-label="발급 절차">
              {DOCUMENT_STEPS.map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}
            </ol>
            {AUTH_FEATURES_ENABLED && !user && <small className="workspace-help">Google 로그인 후 문서를 생성할 수 있습니다.</small>}
          </div>
          {AUTH_FEATURES_ENABLED && <div className="workspace-auth">
            <span className="workspace-small-label">ACCOUNT</span>
            {user ? <>
              <strong title={user.email}>{user.name}</strong>
              <button type="button" onClick={() => { profileMutation.reset(); setEditingProfile(true) }} disabled={busy}>회원정보 수정</button>
              <button type="button" onClick={() => setDocumentHistoryOpen(true)} disabled={busy}>PDF 다운로드 내역</button>
              <button type="button" onClick={logout} disabled={busy}>로그아웃</button>
            </> : <GoogleLoginButton onClick={login} disabled={busy} />}
            {error && !pendingSignup && <p className="auth-error" role="alert">{error}</p>}
          </div>}
        </> : <>
          <button className="workspace-back" type="button" onClick={goBack}><Icon name="back" size={18} /> 이전 단계</button>
          <div className="workspace-sidebar-content">
            <ol className="workspace-stepper" aria-label="문서 생성 단계">
              {DOCUMENT_STEPS.map((label, index) => <li key={label} aria-current={index === stepIndex ? 'step' : undefined}
                className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''}>
                <span>{index < stepIndex ? <Icon name="check" size={14} /> : index + 1}</span>{label}
              </li>)}
            </ol>
            {step === 'region' ? <>
              <h1>문서의 지역을 <br />선택하세요.</h1>
              <p>행정구역으로 지도를 이동한 뒤, 지도에서 분석할 사각형 범위를 직접 그려 주세요.</p>
              <MapRegionSearch cityId={mapCityId} districtId={mapDistrictId} canReset={Boolean(mapCityId || mapDistrictId)}
                areaAction={
                  <button className="workspace-area-button" type="button" aria-pressed={selectingArea}
                    onClick={() => setSelectingArea((current) => !current)}>
                    {selection ? '범위 다시 그리기' : '범위 그리기'}
                  </button>
                }
                onCityChange={(regionId) => {
                  setMapCityId(regionId)
                  setMapDistrictId(0)
                  if (!regionId) setFocusedRegion(null)
                }}
                onDistrictChange={setMapDistrictId}
                onRegionFocus={focusAdministrativeRegion}
                onReset={resetRegionSelection} />
              {selection && <div className="workspace-selection-summary" role="status">
                <span>선택된 분석 범위</span>
                <div><small>지도 위치</small><strong>{selectedDistrictName ?? selectedCityName ?? '사용자 지정 범위'}</strong></div>
                <div><small>저장 방식</small><strong>사각형 좌표 범위</strong></div>
              </div>}
              <button className="workspace-primary" type="button" disabled={!selection}
                onClick={() => setStep('features')}>
                다음 단계 <Icon name="next" size={18} />
              </button>
              {!selection && <small className="workspace-help">영역을 선택하면 다음 단계로 이동할 수 있습니다.</small>}
            </> : <>
              <h1>문서에 담을 <br />기능을 선택하세요.</h1>
              <p>기능을 선택하고 각 카드에서 조회 조건을 설정한 뒤 데이터를 미리 확인할 수 있습니다.</p>
              <div className="workspace-selection-summary">
                <span>선택된 분석 범위</span>
                <div><small>기준 위치</small><strong>{selectedDistrictName ?? selectedCityName ?? '사용자 지정 범위'}</strong></div>
                <div><small>범위</small><strong>지도에서 지정한 사각형</strong></div>
              </div>
            </>}
          </div>
        </>}
      </aside>

      <main className="workspace-main">
        {step === 'features' ? <FeatureSelectionPanel
          features={featuresQuery.data}
          isPending={featuresQuery.isPending}
          isError={featuresQuery.isError}
          selectedFeatureIds={selectedFeatures}
          hasSelection={Boolean(selection)}
          documentName={documentName}
          configs={featureConfigs}
          configSetters={{
            summary: setSummaryConfig,
            points: setPointsConfig,
            monthly: setMonthlyConfig,
            confidence: setConfidenceConfig,
            nearest: setNearestPeriod,
            intensity: setIntensityConfig,
            dayNight: setDayNightConfig,
            comparison: setComparisonConfig,
            hotspots: setHotspotConfig,
          }}
          showHistoryButton={AUTH_FEATURES_ENABLED}
          onToggleFeature={toggleFeature}
          onPreviewFeature={setPreviewFeatureCode}
          onDocumentNameChange={setDocumentName}
          onOpenDocumentPreview={() => setDocumentPreviewOpen(true)}
          onOpenHistory={() => setDocumentHistoryOpen(true)}
        /> : <div className="workspace-map-page">
          <div className="workspace-main-heading"><strong><Icon name="map" size={20} /> 대한민국 위성 지도</strong><span>Sentinel-2 · 2024</span></div>
          <div className="workspace-map-stage">
            <KoreaMap key={`${step === 'home' ? 'home' : 'document'}-${focusedRegion?.id ?? 'all'}`} active={step === 'region'}
              selecting={selectingArea} selection={selection}
              focusBounds={focusedRegion} mapRegions={mapRegionsQuery.data ?? []}
              heat={step === 'home' ? timelapse?.cells : undefined}
              onRegionClick={clickAdministrativeRegion}
              onAreaSelect={(area) => { setSelection(area); setSelectingArea(false) }} />
            {step === 'home' && timelapse && <FireTimelapseLabel year={timelapse.year}
              index={timelapse.index} count={timelapse.count} through={timelapse.through} />}
          </div>
          <SatelliteMapAttribution />
          <div className="workspace-map-footer"><span><i /> {focusedRegion?.name ?? '대한민국 전역'}</span>
            <p>{step === 'home' ? '문서 생성을 누르면 지도를 확대하고 지역을 선택할 수 있습니다.'
              : selectingArea ? '지도 위를 드래그해 분석할 범위를 지정하세요.'
                : '행정구역을 검색하거나 범위 그리기를 시작하세요.'}</p>
            <span>{step === 'home' ? '지도 잠김' : selectingArea ? '범위 선택 중' : '지도 탐색 가능'}</span>
          </div>
        </div>}
      </main>
    </div>
      </div>

      <footer className="portal-footer">
        <div className="portal-footer-inner">
          <span>NASA FIRMS MODIS·VIIRS 위성 관측 기반</span>
          <span>위성 관측에 근거한 참고 자료이며 법적 효력이 있는 증명서가 아닙니다. 공식 통계는 산림청 자료를 따릅니다.</span>
          <span>© 2026 Team Red Soups · NASA Space Apps Challenge</span>
        </div>
      </footer>
      {AUTH_FEATURES_ENABLED && pendingSignup && <SignupModal profile={pendingSignup} busy={busy} error={error}
        onClose={logout} onSubmit={(details: SignupDetails) => signupMutation.mutate(details)} />}
      {AUTH_FEATURES_ENABLED && user && editingProfile && <EditProfileModal user={user} busy={profileMutation.isPending}
        error={profileMutation.error ? '회원정보를 저장하지 못했습니다.' : ''}
        onClose={() => setEditingProfile(false)} onSubmit={saveProfile} />}
      {AUTH_FEATURES_ENABLED && user && documentHistoryOpen && <DocumentHistoryModal onClose={() => setDocumentHistoryOpen(false)} />}
      {(user || !AUTH_FEATURES_ENABLED) && selection && documentPreviewOpen && selectedFeatureOptions.length > 0 && <DocumentPreviewModal
        documentName={documentName.trim()} creatorName={user?.name ?? '산불24'} saveHistory bounds={selection}
        features={selectedFeatureOptions} configs={featureConfigs}
        onClose={() => setDocumentPreviewOpen(false)} />}
      {publicDocumentSearchOpen && <PublicDocumentSearchModal onClose={() => setPublicDocumentSearchOpen(false)} />}
      <FeaturePreviewLayer bounds={selection} featureCode={previewFeatureCode}
        configs={featureConfigs} onClose={() => setPreviewFeatureCode(null)} />
    </div>
  )
}
