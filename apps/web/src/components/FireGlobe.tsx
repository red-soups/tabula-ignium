import { useEffect, useRef, useState } from 'react'
import { EarthGlobe } from '../globe/EarthGlobe'
import { mockFireLocations, type FireLocation } from '../data/mockFireLocations'

const INITIAL_VIEW = { lat: 32, lon: 131, alt: 2.35 }

function formatCoordinates({ latitude, longitude }: FireLocation) {
  const northSouth = latitude < 0 ? '남위' : '북위'
  const eastWest = longitude < 0 ? '서경' : '동경'
  return `${northSouth} ${Math.abs(latitude).toFixed(2)}°, ${eastWest} ${Math.abs(longitude).toFixed(2)}°`
}

export default function FireGlobe() {
  const viewport = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    if (!viewport.current) return

    try {
      const instance = new EarthGlobe(viewport.current, {
        onReady: () => setStatus('ready'),
      })
      instance.setLayers({ heatmap: false, hotspots: false, clouds: true, labels: false, realSun: false })
      instance.setPreviewMarkers(mockFireLocations)
      instance.setAutoRotate(false)
      instance.flyTo(INITIAL_VIEW)
      instance.renderer.domElement.setAttribute('aria-label', '시연 화재 위치가 빨간 점으로 표시된 3D 지구본. 마우스로 회전하고 확대할 수 있습니다.')

      return () => instance.dispose()
    } catch {
      queueMicrotask(() => setStatus('unavailable'))
    }
  }, [])

  return (
    <div className="fire-globe-layout">
      <div ref={viewport} className="fire-globe-viewport">
        <div className="fire-globe-viewport-label"><span className="fire-globe-live-dot" /> 지구 관측 미리보기 <small>· 시연 데이터</small></div>
        {status === 'loading' && <p className="fire-globe-status" role="status">지구본 영상을 불러오는 중입니다.</p>}
        {status === 'unavailable' && <p className="fire-globe-status" role="status">이 브라우저에서 3D 지구본을 표시할 수 없습니다.</p>}
        <div className="fire-globe-viewport-footer">
          {status !== 'unavailable' && <span>드래그로 회전 · 스크롤 또는 두 손가락으로 확대</span>}
          <a href="https://github.com/red-soups/firescope" target="_blank" rel="noreferrer">영상: Sentinel-2 © EOX · NASA (FireScope)</a>
        </div>
      </div>
      <aside className="fire-globe-locations" aria-label="시연 화재 위치">
        <div className="fire-globe-locations-heading">
          <span>DEMO LOCATIONS</span>
          <strong>{String(mockFireLocations.length).padStart(2, '0')}</strong>
        </div>
        <h3>시연 화재 위치</h3>
        <p>빨간 점은 아래 가상 위도·경도를 표시합니다.</p>
        <ul>
          {mockFireLocations.map((location) => (
            <li key={location.id} className="fire-globe-location">
              <span className="fire-globe-dot" aria-hidden="true" />
              <span>
                <strong>{location.name}</strong>
                <small>{formatCoordinates(location)}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className="fire-globe-demo-note">빨간 표시는 실제 화재 정보가 아닌 시연용 좌표입니다.</div>
      </aside>
    </div>
  )
}
