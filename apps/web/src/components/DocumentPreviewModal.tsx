import { useRef, useState } from 'react'
import { useCreateDocumentExportMutation } from '../api/documentExportQueries'
import { downloadBlob } from '../api/documentExports'
import type { FeatureOption } from '../api/features'
import type {
  AnalysisBounds, ConfidenceConfig, FirePointsConfig, FireSummaryConfig, HotspotConfig,
  MonthlyTrendConfig, PeriodAnalysisConfig,
} from '../api/fireData'
import {
  useConfidenceDistributionQuery, useFirePointsQuery, useFireSummaryQuery,
  useHighRiskMonthsQuery, useLargeFireFrequencyQuery, useMonthlyFireTrendQuery,
  useNearestFireQuery, useYearlyFireTrendQuery,
  useDayNightDistributionQuery, useFireHotspotsQuery,
  useFireIntensityQuery, usePeriodComparisonQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'
import { KoreaMap, SatelliteMapAttribution } from './KoreaMap'

const SATELLITE_TILE_SELECTOR = 'svg image[href^="https://tiles.maps.eox.at/"]'
const satelliteTileCache = new Map<string, string>()

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('지도 이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

async function embedSatelliteTiles(root: HTMLElement) {
  if (!root.querySelector('.document-point-map')) return () => undefined

  let images = Array.from(root.querySelectorAll<SVGImageElement>(SATELLITE_TILE_SELECTOR))
  for (let attempt = 0; images.length === 0 && attempt < 30; attempt += 1) {
    await wait(100)
    images = Array.from(root.querySelectorAll<SVGImageElement>(SATELLITE_TILE_SELECTOR))
  }
  if (images.length === 0) throw new Error('PDF에 넣을 위성 지도 타일을 찾지 못했습니다.')

  const originalUrls = images.map((image) => image.getAttribute('href') ?? '')
  const embeddedUrls = await Promise.all(images.map(async (_image, index) => {
    const url = originalUrls[index]
    if (!url) throw new Error('위성 지도 타일 주소가 없습니다.')

    let dataUrl = satelliteTileCache.get(url)
    if (!dataUrl) {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' })
      if (!response.ok) throw new Error(`위성 지도 타일을 불러오지 못했습니다. (${response.status})`)
      dataUrl = await blobToDataUrl(await response.blob())
      satelliteTileCache.set(url, dataUrl)
    }
    return dataUrl
  }))
  images.forEach((image, index) => image.setAttribute('href', embeddedUrls[index]))

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  return () => images.forEach((image, index) => image.setAttribute('href', originalUrls[index]))
}

export type DocumentPreviewConfigs = {
  summary: FireSummaryConfig
  points: FirePointsConfig
  monthly: MonthlyTrendConfig
  confidence: ConfidenceConfig
  nearest: { fromPeriod: string; toPeriod: string }
  intensity: PeriodAnalysisConfig
  dayNight: PeriodAnalysisConfig
  comparison: PeriodAnalysisConfig
  hotspots: HotspotConfig
}

function format(value: number | null | undefined, digits = 1) {
  return value == null ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits })
}

function State({ pending, error, empty, children }: {
  pending: boolean; error: boolean; empty: boolean; children: React.ReactNode
}) {
  if (pending) return <p className="document-panel-state">데이터를 불러오는 중…</p>
  if (error) return <p className="document-panel-state is-error">데이터를 불러오지 못했습니다.</p>
  if (empty) return <p className="document-panel-state">해당 범위에 데이터가 없습니다.</p>
  return children
}

function SummaryPanel({ bounds, config }: { bounds: AnalysisBounds; config: FireSummaryConfig }) {
  const query = useFireSummaryQuery(bounds, config)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={Boolean(data && data.observationCount === 0)}>
    {data && <div className="document-metric-grid">
      <div><span>관측 건수</span><strong>{format(data.observationCount, 0)}</strong></div>
      <div><span>관측일 수</span><strong>{format(data.observedDayCount, 0)}</strong></div>
      <div><span>평균 FRP</span><strong>{format(data.averageFrp, 2)}</strong></div>
      <div><span>최대 FRP</span><strong>{format(data.maximumFrp, 2)}</strong></div>
    </div>}
  </State>
}

function PointsPanel({ bounds, config }: { bounds: AnalysisBounds; config: FirePointsConfig }) {
  const query = useFirePointsQuery(bounds, config)
  const rows = query.data ?? []
  return <div className="document-point-map-wrap">
    <div className="document-point-map">
      <KoreaMap active={false} focusBounds={bounds} selection={bounds} observations={rows} observationPeriod={config.period} />
    </div>
    <SatelliteMapAttribution />
    <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <small className="document-chart-note">최근 6개월 관측 {rows.length.toLocaleString('ko-KR')}건 · 색상은 월, 점 크기는 FRP</small>
    </State>
  </div>
}

function MonthlyPanel({ bounds, config }: { bounds: AnalysisBounds; config: MonthlyTrendConfig }) {
  const query = useMonthlyFireTrendQuery(bounds, config)
  const rows = query.data ?? []
  const max = Math.max(...rows.map((row) => row[config.metric]), 1)
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-bars">{rows.slice(-12).map((row) => <div key={row.period}>
      <i style={{ height: `${Math.max(2, row[config.metric] / max * 100)}%` }} />
      <small>{row.period.slice(2)}</small>
    </div>)}</div>
    <small className="document-chart-note">X축 관측 월 · Y축 {config.metric === 'observationCount' ? '관측 건수' : config.metric === 'totalFrp' ? '전체 FRP' : '평균 FRP'}</small>
  </State>
}

function ConfidencePanel({ bounds, config }: { bounds: AnalysisBounds; config: ConfidenceConfig }) {
  const query = useConfidenceDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-horizontal-bars">{rows.map((row) => <div key={row.confidenceLevel}>
      <span>{row.confidenceLevel}</span><i><b style={{ width: `${row.percentage}%` }} /></i><strong>{row.percentage.toFixed(1)}%</strong>
    </div>)}</div>
  </State>
}

function YearlyPanel({ bounds }: { bounds: AnalysisBounds }) {
  const query = useYearlyFireTrendQuery(bounds)
  const rows = (query.data ?? []).filter((row) => row.complete).slice(-15)
  const max = Math.max(...rows.map((row) => row.harmonized), 1)
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-bars">{rows.map((row) => <div key={row.year}><i style={{ height: `${Math.max(2, row.harmonized / max * 100)}%` }} /><small>{row.year}</small></div>)}</div>
    <small className="document-chart-note">X축 연도 · Y축 보정 화재 관측값</small>
  </State>
}

function LargeFirePanel({ bounds }: { bounds: AnalysisBounds }) {
  const query = useLargeFireFrequencyQuery(bounds)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <><div className="document-metric-grid three">
      <div><span>발생 연도</span><strong>{data.occurrenceYearCount}</strong></div>
      <div><span>재현 주기</span><strong>{format(data.returnPeriodYears)}년</strong></div>
      <div><span>관측 연도</span><strong>{data.yearsWithAnyFire}</strong></div>
    </div><p className="document-panel-detail">최대 월 {data.largestMonths.map((row) => row.period).join(' · ') || '-'}</p></>}
  </State>
}

function RiskPanel({ bounds }: { bounds: AnalysisBounds }) {
  const query = useHighRiskMonthsQuery(bounds)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-risk-months">{rows.map((row) => <div className={row.highRisk ? 'is-high' : ''} key={row.month}>
      <strong>{row.month}월</strong><span>{(row.share * 100).toFixed(1)}%</span>
    </div>)}</div>
  </State>
}

function NearestPanel({ bounds, config }: { bounds: AnalysisBounds; config: DocumentPreviewConfigs['nearest'] }) {
  const query = useNearestFireQuery(bounds, config.fromPeriod, config.toPeriod)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <div className="document-nearest"><span>선택 범위 중심에서</span><strong>{data.distanceKm.toFixed(2)} km</strong>
      <p>{data.sensor} · FRP {data.frp.toFixed(2)} · {data.confidenceLevel}</p>
      <small>1km {data.within1Km}건 · 5km {data.within5Km}건 · 10km {data.within10Km}건</small></div>}
  </State>
}

function IntensityPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const query = useFireIntensityQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-horizontal-bars">{rows.map((row) => <div key={row.intensityLevel}>
      <span>{row.intensityLevel}</span><i><b style={{ width: `${row.percentage}%` }} /></i><strong>{row.percentage.toFixed(1)}%</strong>
    </div>)}</div><small className="document-chart-note">FRP 기준 · 약함 &lt;10 · 보통 10–30 미만 · 강함 30–100 미만 · 매우 강함 ≥100 MW</small>
  </State>
}

function DayNightPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const query = useDayNightDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-metric-grid">{rows.map((row) => <div key={row.periodType}>
      <span>{row.periodType} 관측 · {row.percentage.toFixed(1)}%</span><strong>{format(row.observationCount, 0)}건</strong>
      <small>평균 FRP {format(row.averageFrp)}</small>
    </div>)}</div>
  </State>
}

function ComparisonPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const query = usePeriodComparisonQuery(bounds, config)
  const data = query.data
  const rate = (value: number | null) => value == null ? '비교 불가' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  const metrics = data ? [
    { label: '관측 건수', previous: data.previousObservationCount, current: data.currentObservationCount },
    { label: '평균 FRP', previous: data.previousAverageFrp, current: data.currentAverageFrp },
    { label: '최대 FRP', previous: data.previousMaximumFrp, current: data.currentMaximumFrp },
  ] : []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <><div className="document-comparison-legend"><span><i />이전</span><span><i />현재</span></div>
      <div className="document-comparison-chart">{metrics.map((metric) => {
        const maximum = Math.max(metric.previous ?? 0, metric.current ?? 0, 1)
        const previousHeight = metric.previous == null ? 0 : Math.max(metric.previous > 0 ? 4 : 0, metric.previous / maximum * 100)
        const currentHeight = metric.current == null ? 0 : Math.max(metric.current > 0 ? 4 : 0, metric.current / maximum * 100)
        return <div key={metric.label}><section>
          <i style={{ height: `${previousHeight}%` }} /><i style={{ height: `${currentHeight}%` }} />
        </section><strong>{metric.label}</strong><small>{format(metric.previous)} → {format(metric.current)}</small></div>
      })}</div><div className="document-metric-grid">
      <div><span>관측 건수 증감</span><strong>{rate(data.observationChangeRate)}</strong><small>{data.previousObservationCount} → {data.currentObservationCount}건</small></div>
      <div><span>평균 FRP 증감</span><strong>{rate(data.averageFrpChangeRate)}</strong><small>{format(data.previousAverageFrp)} → {format(data.currentAverageFrp)}</small></div>
    </div><small className="document-chart-note">이전 {data.previousFromPeriod}–{data.previousToPeriod} / 현재 {data.currentFromPeriod}–{data.currentToPeriod}</small></>}
  </State>
}

function HotspotsPanel({ bounds, config }: { bounds: AnalysisBounds; config: HotspotConfig }) {
  const query = useFireHotspotsQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-hotspot-list">{rows.map((row) => <div key={row.hotspotRank}>
      <strong>#{row.hotspotRank}</strong><span>{row.observationCount.toLocaleString('ko-KR')}건</span>
      <small>{row.centerLatitude.toFixed(3)}, {row.centerLongitude.toFixed(3)}</small><b>평균 {row.averageFrp.toFixed(1)} MW</b>
    </div>)}</div>
  </State>
}

function configuration(feature: FeatureOption, configs: DocumentPreviewConfigs) {
  if (feature.code === 'FIRE_SUMMARY') return configs.summary
  if (feature.code === 'FIRE_LOCATION_MAP') return configs.points
  if (feature.code === 'MONTHLY_FIRE_TREND') return configs.monthly
  if (feature.code === 'CONFIDENCE_ANALYSIS') return configs.confidence
  if (feature.code === 'NEAREST_FIRE') return configs.nearest
  if (feature.code === 'FIRE_INTENSITY') return configs.intensity
  if (feature.code === 'DAY_NIGHT_COMPARISON') return configs.dayNight
  if (feature.code === 'PERIOD_COMPARISON') return configs.comparison
  if (feature.code === 'FIRE_HOTSPOTS') return configs.hotspots
  return { basis: 'all-observations' }
}

function Panel({ feature, bounds, configs }: { feature: FeatureOption; bounds: AnalysisBounds; configs: DocumentPreviewConfigs }) {
  return <article className="document-preview-panel"><header><span>FIRE DATA</span><h3>{feature.name}</h3><p>{feature.description}</p></header>
    <div className="document-preview-panel-body">
      {feature.code === 'FIRE_SUMMARY' && <SummaryPanel bounds={bounds} config={configs.summary} />}
      {feature.code === 'FIRE_LOCATION_MAP' && <PointsPanel bounds={bounds} config={configs.points} />}
      {feature.code === 'MONTHLY_FIRE_TREND' && <MonthlyPanel bounds={bounds} config={configs.monthly} />}
      {feature.code === 'CONFIDENCE_ANALYSIS' && <ConfidencePanel bounds={bounds} config={configs.confidence} />}
      {feature.code === 'YEARLY_FIRE_TREND' && <YearlyPanel bounds={bounds} />}
      {feature.code === 'LARGE_FIRE_FREQUENCY' && <LargeFirePanel bounds={bounds} />}
      {feature.code === 'HIGH_RISK_SEASON' && <RiskPanel bounds={bounds} />}
      {feature.code === 'NEAREST_FIRE' && <NearestPanel bounds={bounds} config={configs.nearest} />}
      {feature.code === 'FIRE_INTENSITY' && <IntensityPanel bounds={bounds} config={configs.intensity} />}
      {feature.code === 'DAY_NIGHT_COMPARISON' && <DayNightPanel bounds={bounds} config={configs.dayNight} />}
      {feature.code === 'PERIOD_COMPARISON' && <ComparisonPanel bounds={bounds} config={configs.comparison} />}
      {feature.code === 'FIRE_HOTSPOTS' && <HotspotsPanel bounds={bounds} config={configs.hotspots} />}
    </div>
  </article>
}

export function DocumentPreviewModal({ documentName, creatorName, saveHistory = true, bounds, features, configs, onClose }: {
  documentName: string; creatorName: string; bounds: AnalysisBounds; features: FeatureOption[]
  saveHistory?: boolean; configs: DocumentPreviewConfigs; onClose: () => void
}) {
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const mutation = useCreateDocumentExportMutation()
  const [rendering, setRendering] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportHash, setExportHash] = useState('')
  const createdAt = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  const pages = Array.from({ length: Math.ceil(features.length / 4) }, (_, index) =>
    features.slice(index * 4, index * 4 + 4))

  async function download() {
    const elements = pageRefs.current.filter((page): page is HTMLDivElement => page !== null)
    if (elements.length === 0 || rendering) return
    setRendering(true)
    setExportError('')
    setExportHash('')
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const margin = 7
      const width = 210 - margin * 2
      for (let index = 0; index < elements.length; index += 1) {
        const restoreSatelliteTiles = await embedSatelliteTiles(elements[index])
        let canvas: HTMLCanvasElement
        try {
          canvas = await html2canvas(elements[index], {
            scale: 2, backgroundColor: '#ffffff', useCORS: true, imageTimeout: 15_000, logging: false,
          })
        } finally {
          restoreSatelliteTiles()
        }
        if (index > 0) pdf.addPage('a4', 'portrait')
        const height = Math.min(297 - margin * 2, canvas.height * width / canvas.width)
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', margin, margin, width, height, undefined, 'FAST')
      }
      const blob = pdf.output('blob')
      let fileName = `${documentName}.pdf`
      if (saveHistory) {
        const history = await mutation.mutateAsync({
          documentName, bounds, file: blob,
          featureIds: features.map((feature) => feature.id),
          configurations: features.map((feature) => JSON.stringify(configuration(feature, configs))),
        })
        fileName = history.originalFileName
        setExportHash(history.accessHash)
      }
      downloadBlob(blob, fileName)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'PDF를 생성하지 못했습니다.')
    } finally {
      setRendering(false)
    }
  }

  return <div className="document-preview-backdrop"><div className="document-preview-dialog" role="dialog" aria-modal="true" aria-label="문서 미리보기">
    <div className="document-preview-toolbar"><div><strong>문서 미리보기</strong><span>선택한 기능이 페이지마다 4개씩 배치됩니다.</span></div>
      <div><button type="button" onClick={onClose}>닫기</button><button className="is-primary" type="button" onClick={download} disabled={rendering}>
        {rendering ? 'PDF 생성 중…' : 'PDF 다운로드'} <Icon name="download" size={15} />
      </button></div></div>
    {(exportError || saveHistory && mutation.isError) && <p className="document-export-error">
      {exportError || 'PDF 저장 이력을 등록하지 못했습니다.'}
    </p>}
    {exportHash && <p className="document-export-success">
      다운로드 해시 <strong>{exportHash}</strong> · 파일명 앞의 해시로 문서를 다시 받을 수 있습니다.
    </p>}
    <div className="document-preview-scroll">{pages.map((pageFeatures, pageIndex) => <div className="document-preview-page" key={pageIndex}
      ref={(element) => { pageRefs.current[pageIndex] = element }}>
      <header className="document-page-header"><div><span>SANBUL 24 / FIRE REPORT · {pageIndex + 1}/{pages.length}</span><h2>{documentName}</h2></div><strong>산불24</strong></header>
      <div className="document-page-area"><span>사용자 지정 분석 범위</span><strong>{bounds.west.toFixed(4)}, {bounds.south.toFixed(4)} — {bounds.east.toFixed(4)}, {bounds.north.toFixed(4)}</strong></div>
      <main className="document-preview-grid">{pageFeatures.map((feature) => <Panel key={feature.id} feature={feature} bounds={bounds} configs={configs} />)}</main>
      <footer className="document-page-footer"><div><span>문서 생성일</span><strong>{createdAt}</strong></div><div><span>생성자</span><strong>{creatorName}</strong></div></footer>
    </div>)}</div>
  </div></div>
}
