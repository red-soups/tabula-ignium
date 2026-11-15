import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import i18n, { localeFor } from '../i18n'

const SATELLITE_TILE_SELECTOR = 'svg image[href^="https://tiles.maps.eox.at/"]'
const satelliteTileCache = new Map<string, string>()

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(i18n.t('document.mapReadError')))
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
  if (images.length === 0) throw new Error(i18n.t('document.mapTileMissing'))

  const originalUrls = images.map((image) => image.getAttribute('href') ?? '')
  const embeddedUrls = await Promise.all(images.map(async (_image, index) => {
    const url = originalUrls[index]
    if (!url) throw new Error(i18n.t('document.mapTileUrlMissing'))

    let dataUrl = satelliteTileCache.get(url)
    if (!dataUrl) {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' })
      if (!response.ok) throw new Error(i18n.t('document.mapTileLoadError', { status: response.status }))
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
  return value == null ? '-' : value.toLocaleString(localeFor(), { maximumFractionDigits: digits })
}

function State({ pending, error, empty, children }: {
  pending: boolean; error: boolean; empty: boolean; children: React.ReactNode
}) {
  const { t } = useTranslation()
  if (pending) return <p className="document-panel-state">{t('document.dataLoading')}</p>
  if (error) return <p className="document-panel-state is-error">{t('document.dataLoadError')}</p>
  if (empty) return <p className="document-panel-state">{t('document.dataEmpty')}</p>
  return children
}

function SummaryPanel({ bounds, config }: { bounds: AnalysisBounds; config: FireSummaryConfig }) {
  const { t } = useTranslation()
  const query = useFireSummaryQuery(bounds, config)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={Boolean(data && data.observationCount === 0)}>
    {data && <div className="document-metric-grid">
      <div><span>{t('fire.labels.observationCount')}</span><strong>{format(data.observationCount, 0)}</strong></div>
      <div><span>{t('fire.labels.observedDays')}</span><strong>{format(data.observedDayCount, 0)}</strong></div>
      <div><span>{t('fire.labels.averageFrp')}</span><strong>{format(data.averageFrp, 2)}</strong></div>
      <div><span>{t('fire.labels.maximumFrp')}</span><strong>{format(data.maximumFrp, 2)}</strong></div>
    </div>}
  </State>
}

function PointsPanel({ bounds, config }: { bounds: AnalysisBounds; config: FirePointsConfig }) {
  const { t } = useTranslation()
  const query = useFirePointsQuery(bounds, config)
  const rows = query.data ?? []
  return <div className="document-point-map-wrap">
    <div className="document-point-map">
      <KoreaMap active={false} focusBounds={bounds} selection={bounds} observations={rows} observationPeriod={config.period} />
    </div>
    <SatelliteMapAttribution />
    <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <small className="document-chart-note">{t('document.sixMonthPoints', { count: rows.length.toLocaleString(localeFor()) })}</small>
    </State>
  </div>
}

function MonthlyPanel({ bounds, config }: { bounds: AnalysisBounds; config: MonthlyTrendConfig }) {
  const { t } = useTranslation()
  const query = useMonthlyFireTrendQuery(bounds, config)
  const rows = query.data ?? []
  const max = Math.max(...rows.map((row) => row[config.metric]), 1)
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-bars">{rows.slice(-12).map((row) => <div key={row.period}>
      <i style={{ height: `${Math.max(2, row[config.metric] / max * 100)}%` }} />
      <small>{row.period.slice(2)}</small>
    </div>)}</div>
    <small className="document-chart-note">{t('fire.axisXMonth')} · Y · {t(`feature.metrics.${config.metric}`)}</small>
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
  const { t } = useTranslation()
  const query = useYearlyFireTrendQuery(bounds)
  const rows = (query.data ?? []).filter((row) => row.complete).slice(-15)
  const max = Math.max(...rows.map((row) => row.harmonized), 1)
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-bars">{rows.map((row) => <div key={row.year}><i style={{ height: `${Math.max(2, row.harmonized / max * 100)}%` }} /><small>{row.year}</small></div>)}</div>
    <small className="document-chart-note">{t('fire.axisXYear')} · Y · {t('fire.correctedIndex')}</small>
    <p className="document-metric-explanation">{t('fire.correctedIndexDescription')}</p>
  </State>
}

function LargeFirePanel({ bounds }: { bounds: AnalysisBounds }) {
  const { t } = useTranslation()
  const query = useLargeFireFrequencyQuery(bounds)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <><div className="document-metric-grid three">
      <div><span>{t('document.occurrenceYears')}</span><strong>{data.occurrenceYearCount}</strong></div>
      <div><span>{t('document.returnPeriod')}</span><strong>{t('document.yearValue', { value: format(data.returnPeriodYears) })}</strong></div>
      <div><span>{t('document.observedYears')}</span><strong>{data.yearsWithAnyFire}</strong></div>
    </div><p className="document-panel-detail">{t('document.peakMonths')} {data.largestMonths.map((row) => row.period).join(' · ') || '-'}</p></>}
  </State>
}

function RiskPanel({ bounds }: { bounds: AnalysisBounds }) {
  const { t } = useTranslation()
  const query = useHighRiskMonthsQuery(bounds)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-risk-months">{rows.map((row) => <div className={row.highRisk ? 'is-high' : ''} key={row.month}>
      <strong>{t('document.monthValue', { value: row.month })}</strong><span>{(row.share * 100).toFixed(1)}%</span>
    </div>)}</div>
  </State>
}

function NearestPanel({ bounds, config }: { bounds: AnalysisBounds; config: DocumentPreviewConfigs['nearest'] }) {
  const { t } = useTranslation()
  const query = useNearestFireQuery(bounds, config.fromPeriod, config.toPeriod)
  const data = query.data
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <div className="document-nearest"><span>{t('document.fromAreaCenter')}</span><strong>{data.distanceKm.toFixed(2)} km</strong>
      <p>{data.sensor} · FRP {data.frp.toFixed(2)} · {data.confidenceLevel}</p>
      <small>{t('document.distanceCounts', { one: data.within1Km, five: data.within5Km, ten: data.within10Km })}</small></div>}
  </State>
}

function IntensityPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const { t } = useTranslation()
  const query = useFireIntensityQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-horizontal-bars">{rows.map((row) => <div key={row.intensityLevel}>
      <span>{row.intensityLevel}</span><i><b style={{ width: `${row.percentage}%` }} /></i><strong>{row.percentage.toFixed(1)}%</strong>
    </div>)}</div><small className="document-chart-note">{t('feature.intensityNote')}</small>
  </State>
}

function DayNightPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const { t } = useTranslation()
  const query = useDayNightDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-metric-grid">{rows.map((row) => <div key={row.periodType}>
      <span>{t('document.periodObservation', { period: row.periodType })} · {row.percentage.toFixed(1)}%</span><strong>{t('common.observations', { count: format(row.observationCount, 0) })}</strong>
      <small>{t('fire.labels.averageFrp')} {format(row.averageFrp)}</small>
    </div>)}</div>
  </State>
}

function ComparisonPanel({ bounds, config }: { bounds: AnalysisBounds; config: PeriodAnalysisConfig }) {
  const { t } = useTranslation()
  const query = usePeriodComparisonQuery(bounds, config)
  const data = query.data
  const rate = (value: number | null) => value == null ? t('document.notComparable') : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  const metrics = data ? [
    { label: t('fire.labels.observationCount'), previous: data.previousObservationCount, current: data.currentObservationCount },
    { label: t('fire.labels.averageFrp'), previous: data.previousAverageFrp, current: data.currentAverageFrp },
    { label: t('fire.labels.maximumFrp'), previous: data.previousMaximumFrp, current: data.currentMaximumFrp },
  ] : []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
    {data && <><div className="document-comparison-legend"><span><i />{t('document.previous')}</span><span><i />{t('document.current')}</span></div>
      <div className="document-comparison-chart">{metrics.map((metric) => {
        const maximum = Math.max(metric.previous ?? 0, metric.current ?? 0, 1)
        const previousHeight = metric.previous == null ? 0 : Math.max(metric.previous > 0 ? 4 : 0, metric.previous / maximum * 100)
        const currentHeight = metric.current == null ? 0 : Math.max(metric.current > 0 ? 4 : 0, metric.current / maximum * 100)
        return <div key={metric.label}><section>
          <i style={{ height: `${previousHeight}%` }} /><i style={{ height: `${currentHeight}%` }} />
        </section><strong>{metric.label}</strong><small>{format(metric.previous)} → {format(metric.current)}</small></div>
      })}</div><div className="document-metric-grid">
      <div><span>{t('document.observationChange')}</span><strong>{rate(data.observationChangeRate)}</strong><small>{data.previousObservationCount} → {t('common.observations', { count: data.currentObservationCount })}</small></div>
      <div><span>{t('document.averageFrpChange')}</span><strong>{rate(data.averageFrpChangeRate)}</strong><small>{format(data.previousAverageFrp)} → {format(data.currentAverageFrp)}</small></div>
    </div><small className="document-chart-note">{t('document.periodComparison', { previousFrom: data.previousFromPeriod, previousTo: data.previousToPeriod, currentFrom: data.currentFromPeriod, currentTo: data.currentToPeriod })}</small></>}
  </State>
}

function HotspotsPanel({ bounds, config }: { bounds: AnalysisBounds; config: HotspotConfig }) {
  const { t } = useTranslation()
  const query = useFireHotspotsQuery(bounds, config)
  const rows = query.data ?? []
  return <State pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
    <div className="document-point-map-wrap">
      <div className="document-point-map document-hotspot-map">
        <KoreaMap active={false} focusBounds={bounds} selection={bounds}
          hotspots={rows} hotspotGridMeters={config.gridMeters} />
      </div>
      <SatelliteMapAttribution />
      <small className="document-chart-note">{t('document.hotspotNote', { grid: config.gridMeters / 1000 })}</small>
      <div className="document-hotspot-summary">{rows.slice(0, 5).map((row) => <span key={row.hotspotRank}>
        <strong>#{row.hotspotRank}</strong> {t('common.observations', { count: row.observationCount.toLocaleString(localeFor()) })}
      </span>)}</div>
    </div>
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
  const { t } = useTranslation()
  return <article className="document-preview-panel"><header><span>{t('document.satelliteItem')}</span><h3>{feature.name}</h3><p>{feature.description}</p></header>
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
  const { t, i18n: i18nInstance } = useTranslation()
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const mutation = useCreateDocumentExportMutation()
  const [rendering, setRendering] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportHash, setExportHash] = useState('')
  const createdAt = new Intl.DateTimeFormat(localeFor(i18nInstance.resolvedLanguage), { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
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
      setExportError(error instanceof Error ? error.message : t('document.pdfCreateError'))
    } finally {
      setRendering(false)
    }
  }

  return <div className="document-preview-backdrop"><div className="document-preview-dialog" role="dialog" aria-modal="true" aria-label={t('document.preview')}>
    <div className="document-preview-toolbar"><div><strong>{t('document.preview')}</strong><span>{t('document.previewDescription')}</span></div>
      <div><button type="button" onClick={onClose}>{t('common.close')}</button><button className="is-primary" type="button" onClick={download} disabled={rendering}>
        {rendering ? t('document.creatingPdf') : t('document.downloadPdf')} <Icon name="download" size={15} />
      </button></div></div>
    {(exportError || saveHistory && mutation.isError) && <p className="document-export-error">
      {exportError || t('document.historyError')}
    </p>}
    {exportHash && <p className="document-export-success">
      {t('document.downloadHash')} <strong>{exportHash}</strong> · {t('document.hashHelp')}
    </p>}
    <div className="document-preview-scroll">{pages.map((pageFeatures, pageIndex) => <div className="document-preview-page" key={pageIndex}
      ref={(element) => { pageRefs.current[pageIndex] = element }}>
      <header className="document-page-header"><div><span>{t('document.pageTitle', { current: pageIndex + 1, total: pages.length })}</span><h2>{documentName}</h2></div><strong>산불24</strong></header>
      <div className="document-page-area"><span>{t('document.customArea')}</span><strong>{bounds.west.toFixed(4)}, {bounds.south.toFixed(4)} — {bounds.east.toFixed(4)}, {bounds.north.toFixed(4)}</strong></div>
      <main className="document-preview-grid">{pageFeatures.map((feature) => <Panel key={feature.id} feature={feature} bounds={bounds} configs={configs} />)}</main>
      <footer className="document-page-footer"><div><span>{t('document.createdAt')}</span><strong>{createdAt}</strong></div><div><span>{t('document.creator')}</span><strong>{creatorName}</strong></div></footer>
    </div>)}</div>
  </div></div>
}
