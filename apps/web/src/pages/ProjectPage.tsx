import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccountQuery } from '../api/authQueries'
import { getProject, getProjectMap, type ProjectMapResponse } from '../api/projects'
import { EarthGlobe, type ViewInfo } from '../globe/EarthGlobe'
import { formatLatLon } from '../globe/geo'
import { DEFAULT_SATELLITES, SATELLITES, formatUtc, loadHotspots, type FirmsResult } from '../data/firms'
import './ProjectPage.css'

function regionView(region: ProjectMapResponse['regions'][number], width: number, height: number) {
  const radians = Math.PI / 180
  const centerLat = Math.max(-85, Math.min(85, (region.south + region.north) / 2))
  const centerLon = (region.west + region.east) / 2
  const centerLatRad = centerLat * radians
  const verticalSlope = Math.tan(20 * radians) * 0.88
  const horizontalSlope = verticalSlope * Math.max(width, 1) / Math.max(height, 1)
  let distance = 1.0022

  // Fit the geographic bounds inside the perspective camera with a small margin.
  for (let y = 0; y <= 8; y++) {
    const lat = (region.south + (region.north - region.south) * y / 8) * radians
    for (let x = 0; x <= 8; x++) {
      const lon = (region.west + (region.east - region.west) * x / 8 - centerLon) * radians
      const front = Math.sin(centerLatRad) * Math.sin(lat)
        + Math.cos(centerLatRad) * Math.cos(lat) * Math.cos(lon)
      const east = Math.cos(lat) * Math.sin(lon)
      const north = Math.cos(centerLatRad) * Math.sin(lat)
        - Math.sin(centerLatRad) * Math.cos(lat) * Math.cos(lon)
      distance = Math.max(distance, front + Math.abs(east) / horizontalSlope,
        front + Math.abs(north) / verticalSlope)
    }
  }

  return {
    lat: centerLat,
    lon: centerLon,
    alt: Math.min(6, distance - 1),
  }
}

function ProjectGlobe({ map, selectedId, focusRequest, onFocusFirst }: {
  map: ProjectMapResponse | undefined
  selectedId: number | null
  focusRequest: number
  onFocusFirst: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const globe = useRef<EarthGlobe | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [view, setView] = useState<ViewInfo | null>(null)
  const [autoRotate, setAutoRotate] = useState(false)
  const [fires, setFires] = useState<FirmsResult | null>(null)
  const [firesPercent, setFiresPercent] = useState(0)
  const [firesError, setFiresError] = useState(false)

  useEffect(() => {
    if (!stage.current) return
    try {
      const instance = new EarthGlobe(stage.current, {
        onReady: () => setReady(true),
        onView: setView,
        onAutoRotate: setAutoRotate,
      })
      globe.current = instance
      instance.setLayers({ heatmap: false, hotspots: false, clouds: true, labels: false, realSun: false })
      instance.setAutoRotate(false)
      return () => {
        globe.current = null
        instance.dispose()
      }
    } catch {
      queueMicrotask(() => setUnavailable(true))
    }
  }, [])

  // FIRMS 최근 7일 실제 탐지 (MODIS + NOAA-20). 고정 열원은 Worker에서 걸러진다. src/data/firms.ts
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    loadHotspots('7d', DEFAULT_SATELLITES, (p) => {
      if (!cancelled && p.total) setFiresPercent(Math.min(99, Math.round((p.loaded / p.total) * 100)))
    })
      .then((result) => {
        if (cancelled || !globe.current) return
        globe.current.setData(result.hotspots, [])
        globe.current.setLayers({ heatmap: false, hotspots: true, clouds: true, labels: false, realSun: false })
        setFires(result)
      })
      .catch(() => { if (!cancelled) setFiresError(true) })
    return () => { cancelled = true }
  }, [ready])

  useEffect(() => {
    const element = stage.current
    const region = map?.regions.find((item) => item.id === selectedId) ?? map?.regions[0]
    if (!element || !region) return
    const focus = () => globe.current?.flyTo(regionView(region, element.clientWidth, element.clientHeight))
    focus()
    let previousWidth = element.clientWidth
    let previousHeight = element.clientHeight
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === previousWidth && element.clientHeight === previousHeight) return
      previousWidth = element.clientWidth
      previousHeight = element.clientHeight
      focus()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [map, selectedId, focusRequest])

  return (
    <div className="project-globe-stage" ref={stage}>
      {!ready && !unavailable && <p className="project-globe-loading" role="status">지구본 영상을 불러오는 중입니다.</p>}
      {unavailable && <p className="project-globe-loading" role="alert">이 브라우저에서 3D 지구본을 표시할 수 없습니다.</p>}
      <div className="project-globe-caption"><span className="project-globe-indicator" /> 위성 지구본 <small>{fires
        ? `FIRMS 최근 7일 · ${fires.count.toLocaleString('ko-KR')}건 (${DEFAULT_SATELLITES.map((s) => SATELLITES[s].label).join(' + ')})`
        : firesError ? 'FIRMS 화재 데이터를 불러오지 못했습니다' : ready ? `FIRMS 화재 데이터 불러오는 중 ${firesPercent}%` : 'FireScope 방식'}</small></div>
      <div className="project-globe-tools" aria-label="지구본 조작">
        <button type="button" onClick={() => globe.current?.zoom(0.65)} aria-label="확대" disabled={unavailable}>+</button>
        <button type="button" onClick={() => globe.current?.zoom(1.5)} aria-label="축소" disabled={unavailable}>−</button>
        <button type="button" onClick={onFocusFirst} aria-label="첫 지역으로 이동" disabled={unavailable || !map?.regions.length}>⌖</button>
        <button type="button" onClick={() => { const next = !autoRotate; globe.current?.setAutoRotate(next); setAutoRotate(next) }} aria-label="자동 회전" aria-pressed={autoRotate} disabled={unavailable}>⟳</button>
      </div>
      {view && <div className="project-globe-hud">고도 {Math.round(view.altKm).toLocaleString('ko-KR')} km · {formatLatLon(view.lat, view.lon)} · {view.level > 0 ? `Sentinel-2 L${view.level}` : '기본 지구 영상'}</div>}
      <div className="project-globe-credit">Sentinel-2 cloudless © EOX · NASA 지구 영상{fires?.newest != null && ` · 화재: NASA FIRMS, 최신 ${formatUtc(fires.newest)}`}</div>
    </div>
  )
}

export default function ProjectPage({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const account = useAccountQuery()
  const registered = account.data && 'id' in account.data
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: ({ signal }) => getProject(projectId, signal),
    enabled: Boolean(registered),
  })
  const map = useQuery({
    queryKey: ['project-map', projectId],
    queryFn: ({ signal }) => getProjectMap(projectId, signal),
    enabled: Boolean(project.data),
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)

  return (
    <div className="project-page">
      <header className="project-page-header">
        <button type="button" className="project-page-brand" onClick={onBack}>◉ <strong>FireScope</strong></button>
        <span className="project-page-crumb">{project.data?.name ?? '프로젝트'}</span>
        <span className="project-page-header-note">관측 지역 지구본</span>
      </header>
      <div className="project-page-layout">
        <aside className="project-page-sidebar">
          <button type="button" className="project-page-back" onClick={onBack}>‹ 모든 프로젝트</button>
          {account.isPending ? <p role="status">로그인 상태를 확인하는 중입니다.</p> : !registered ? (
            <div className="project-page-state"><h1>로그인이 필요합니다</h1><p>프로젝트를 보려면 Google로 로그인해 주세요.</p><a href="/oauth2/authorization/google">Google 로그인</a></div>
          ) : project.isPending ? <p role="status">프로젝트를 불러오는 중입니다.</p> : project.isError || !project.data ? (
            <div className="project-page-state"><h1>프로젝트를 찾을 수 없습니다</h1><p>삭제되었거나 접근할 수 없는 프로젝트입니다.</p></div>
          ) : (
            <>
              <h1>{project.data.name}</h1>
              <p className="project-page-description">{project.data.description || '프로젝트 설명이 없습니다.'}</p>
              <section className="project-page-section">
                <h2>관심 영역 <span>{project.data.regions.length}</span></h2>
                {map.isPending && <p role="status">지역 위치를 불러오는 중입니다.</p>}
                {map.isError && <p role="alert">지역 위치를 불러오지 못했습니다.</p>}
                {map.data?.regions.map((region) => (
                  <button key={region.id} type="button" className={`project-page-region${selectedId === region.id ? ' is-selected' : ''}`}
                    onClick={() => { setSelectedId(region.id); setFocusRequest((request) => request + 1) }} aria-pressed={selectedId === region.id}>
                    <span className="project-region-dot" /><span>{region.name}<small>{['국가', '시·도', '군·구'][region.level] ?? '지역'} · 눌러서 이동</small></span>
                  </button>
                ))}
              </section>
              <section className="project-page-section">
                <h2>설정된 기능 <span>{project.data.features.length}</span></h2>
                <div className="project-page-features">{project.data.features.map((feature) => <span key={feature.id}>{feature.name}</span>)}</div>
                <p className="project-page-feature-note">기능별 관측 화면은 추후 연결됩니다.</p>
              </section>
            </>
          )}
        </aside>
        <main className="project-page-main" aria-label="프로젝트 지역 지구본">
          {project.data && <ProjectGlobe map={map.data} selectedId={selectedId} focusRequest={focusRequest}
            onFocusFirst={() => { if (map.data?.regions[0]) { setSelectedId(map.data.regions[0].id); setFocusRequest((request) => request + 1) } }} />}
          {!project.data && <div className="project-page-placeholder">프로젝트를 선택하면 지구본을 표시합니다.</div>}
        </main>
      </div>
    </div>
  )
}
