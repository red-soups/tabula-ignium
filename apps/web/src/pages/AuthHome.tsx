import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  periodAt,
  type DocumentFeatureConfigs,
} from '../features/document/documentConfig'
import { localizedFeature } from '../i18n/features'
import './DocumentMap.css'

type Step = 'home' | 'region' | 'features'
const AUTH_FEATURES_ENABLED = false

function signupError(error: Error | null, translate: (key: string) => string) {
  if (error instanceof AuthRequestError && error.status === 401) {
    return translate('auth.signupExpired')
  }
  if (error instanceof AuthRequestError && error.status === 409) {
    return translate('auth.emailExists')
  }
  return error ? translate('auth.signupFailed') : ''
}

export default function AuthHome() {
  const { t } = useTranslation()
  const documentSteps = t('home.steps', { returnObjects: true }) as string[]
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
  const [documentName, setDocumentName] = useState(() => t('home.defaultDocumentName'))
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false)
  const [documentHistoryOpen, setDocumentHistoryOpen] = useState(false)
  const [publicDocumentSearchOpen, setPublicDocumentSearchOpen] = useState(false)
  const [redirectError, setRedirectError] = useState(() =>
    new URLSearchParams(window.location.search).get('login') === 'failed'
      ? t('auth.googleFailed') : '',
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
  const selectedFeatureOptions = featuresQuery.data
    ?.filter((feature) => selectedFeatures.includes(feature.id))
    .map((feature) => localizedFeature(feature, t)) ?? []
  const busy = AUTH_FEATURES_ENABLED && (accountQuery.isPending || signupMutation.isPending
    || logoutMutation.isPending || profileMutation.isPending)
  const error = AUTH_FEATURES_ENABLED ? redirectError
    || (accountQuery.error ? t('auth.statusFailed') : '')
    || signupError(signupMutation.error, t)
    || (logoutMutation.error ? t('auth.logoutFailed') : '') : ''

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
        <nav className="portal-breadcrumb" aria-label={t('home.breadcrumb')}>
          <span>{t('home.home')}</span>
          <Icon name="chevron" size={14} />
          <span className={step === 'home' ? 'is-current' : ''}>{t('home.issueReport')}</span>
          {stepIndex >= 0 && <><Icon name="chevron" size={14} /><span className="is-current">{documentSteps[stepIndex]}</span></>}
        </nav>
    <div className="workspace-shell">
      <aside className="workspace-sidebar" aria-label={t('home.workMenu')}>
        {step === 'home' ? <>
          <div className="workspace-sidebar-content">
            <span className="workspace-kicker">{t('home.report')}</span>
            <h1>{t('home.headline1')}<br />{t('home.headline2')}</h1>
            <p>{t('home.description')}</p>
            <div className="workspace-services">
              <button className="workspace-service is-primary" type="button" disabled={AUTH_FEATURES_ENABLED && (!user || busy)}
                onClick={() => setStep('region')}>
                <span className="workspace-service-icon"><Icon name="file" size={24} /></span>
                <span className="workspace-service-text"><strong>{t('home.create')}</strong><small>{t('home.createDescription')}</small></span>
                <Icon name="chevron" size={20} />
              </button>
              <button className="workspace-service" type="button" onClick={() => setPublicDocumentSearchOpen(true)}>
                <span className="workspace-service-icon"><Icon name="search" size={24} /></span>
                <span className="workspace-service-text"><strong>{t('home.findByHash')}</strong><small>{t('home.findByHashDescription')}</small></span>
                <Icon name="chevron" size={20} />
              </button>
            </div>
            <ol className="workspace-guide" aria-label={t('home.process')}>
              {documentSteps.map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}
            </ol>
            {AUTH_FEATURES_ENABLED && !user && <small className="workspace-help">{t('auth.loginRequired')}</small>}
          </div>
          {AUTH_FEATURES_ENABLED && <div className="workspace-auth">
            <span className="workspace-small-label">ACCOUNT</span>
            {user ? <>
              <strong title={user.email}>{user.name}</strong>
              <button type="button" onClick={() => { profileMutation.reset(); setEditingProfile(true) }} disabled={busy}>{t('auth.editProfile')}</button>
              <button type="button" onClick={() => setDocumentHistoryOpen(true)} disabled={busy}>{t('history.title')}</button>
              <button type="button" onClick={logout} disabled={busy}>{t('auth.logout')}</button>
            </> : <GoogleLoginButton onClick={login} disabled={busy} />}
            {error && !pendingSignup && <p className="auth-error" role="alert">{error}</p>}
          </div>}
        </> : <>
          <button className="workspace-back" type="button" onClick={goBack}><Icon name="back" size={18} /> {t('home.previous')}</button>
          <div className="workspace-sidebar-content">
            <ol className="workspace-stepper" aria-label={t('home.documentSteps')}>
              {documentSteps.map((label, index) => <li key={label} aria-current={index === stepIndex ? 'step' : undefined}
                className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''}>
                <span>{index < stepIndex ? <Icon name="check" size={14} /> : index + 1}</span>{label}
              </li>)}
            </ol>
            {step === 'region' ? <>
              <h1>{t('home.selectRegionTitle')}</h1>
              <p>{t('home.selectRegionDescription')}</p>
              <MapRegionSearch cityId={mapCityId} districtId={mapDistrictId} canReset={Boolean(mapCityId || mapDistrictId)}
                areaAction={
                  <button className="workspace-area-button" type="button" aria-pressed={selectingArea}
                    onClick={() => setSelectingArea((current) => !current)}>
                    {selection ? t('home.redrawArea') : t('home.drawArea')}
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
                <span>{t('home.selectedArea')}</span>
                <div><small>{t('home.mapLocation')}</small><strong>{selectedDistrictName ?? selectedCityName ?? t('home.customArea')}</strong></div>
                <div><small>{t('home.saveMethod')}</small><strong>{t('home.rectangleBounds')}</strong></div>
              </div>}
              <button className="workspace-primary" type="button" disabled={!selection}
                onClick={() => setStep('features')}>
                {t('home.next')} <Icon name="next" size={18} />
              </button>
              {!selection && <small className="workspace-help">{t('home.areaRequired')}</small>}
            </> : <>
              <h1>{t('home.selectFeaturesTitle')}</h1>
              <p>{t('home.selectFeaturesDescription')}</p>
              <div className="workspace-selection-summary">
                <span>{t('home.selectedArea')}</span>
                <div><small>{t('home.referenceLocation')}</small><strong>{selectedDistrictName ?? selectedCityName ?? t('home.customArea')}</strong></div>
                <div><small>{t('home.range')}</small><strong>{t('home.mapRectangle')}</strong></div>
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
          <div className="workspace-main-heading"><strong><Icon name="map" size={20} /> {t('home.mapTitle')}</strong><span>Sentinel-2 · 2024</span></div>
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
          <div className="workspace-map-footer"><span><i /> {focusedRegion?.name ?? t('home.wholeKorea')}</span>
            <p>{step === 'home' ? t('home.startHint')
              : selectingArea ? t('home.dragHint')
                : t('home.searchHint')}</p>
            <span>{step === 'home' ? t('home.mapLocked') : selectingArea ? t('home.selectingArea') : t('home.mapExplore')}</span>
          </div>
        </div>}
      </main>
    </div>
      </div>

      <footer className="portal-footer">
        <div className="portal-footer-inner">
          <span>{t('home.footerSource')}</span>
          <span>{t('home.footerNotice')}</span>
          <span>© 2026 Team Red Soups · NASA Space Apps Challenge</span>
        </div>
      </footer>
      {AUTH_FEATURES_ENABLED && pendingSignup && <SignupModal profile={pendingSignup} busy={busy} error={error}
        onClose={logout} onSubmit={(details: SignupDetails) => signupMutation.mutate(details)} />}
      {AUTH_FEATURES_ENABLED && user && editingProfile && <EditProfileModal user={user} busy={profileMutation.isPending}
        error={profileMutation.error ? t('auth.profileSaveFailed') : ''}
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
