import type { AnalysisBounds, HotspotConfig, PeriodAnalysisConfig } from '../api/fireData'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { localeFor } from '../i18n'
import {
  useDayNightDistributionQuery, useFireHotspotsQuery,
  useFireIntensityQuery, usePeriodComparisonQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'
import { PreviewShell, QueryState } from './FireFeaturePreviewModals'
import { KoreaMap, SatelliteMapAttribution } from './KoreaMap'

function context(regionName: string, config: PeriodAnalysisConfig, t: TFunction) {
  return <><strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{config.sensor === 'ALL' ? t('feature.allSensors') : config.sensor}</span></>
}

function change(value: number | null, t: TFunction) {
  if (value == null) return t('fire.notComparable')
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function comparisonHeight(value: number | null, maximum: number) {
  if (value == null || maximum <= 0) return 0
  return Math.max(4, value / maximum * 100)
}

export function FireIntensityPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useFireIntensityQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title={t('fire.titles.intensity')} context={context(regionName, config, t)} onClose={onClose}>
    <div className="fire-intensity-criteria" aria-label={t('fire.intensityCriteria')}>
      <strong>{t('fire.frpCriteria')}</strong>
      <span><i className="is-low" />{t('fire.low')} <b>{t('fire.below', { value: 10 })}</b></span>
      <span><i className="is-moderate" />{t('fire.moderate')} <b>{t('fire.rangeBelow', { from: 10, to: 30 })}</b></span>
      <span><i className="is-high" />{t('fire.high')} <b>{t('fire.rangeBelow', { from: 30, to: 100 })}</b></span>
      <span><i className="is-extreme" />{t('fire.extreme')} <b>{t('fire.above', { value: 100 })}</b></span>
    </div>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>{t('fire.axisYIntensity')}</span><span>{t('fire.axisXRatio')}</span></div>
      <div className="fire-confidence-chart">{rows.map((row) => <article key={row.intensityLevel}>
        <header><strong>{row.intensityLevel}</strong><span>{t('common.observations', { count: row.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })} · {t('fire.labels.averageFrp')} {row.averageFrp.toFixed(1)} MW</span></header>
        <div><i style={{ width: `${row.percentage}%` }} /></div>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function DayNightPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useDayNightDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title={t('fire.titles.dayNight')} context={context(regionName, config, t)} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-summary-grid fire-day-night-grid">{rows.map((row) => <article key={row.periodType}>
        <span>{t('document.periodObservation', { period: row.periodType })}</span><strong>{row.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage))}</strong><small>{row.percentage.toFixed(1)}%</small>
        <p>{t('fire.labels.averageFrp')} {row.averageFrp.toFixed(1)} · {t('fire.labels.maximumFrp')} {row.maximumFrp.toFixed(1)}</p>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function PeriodComparisonPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = usePeriodComparisonQuery(bounds, config)
  const data = query.data
  const metrics = data ? [
    { label: t('fire.labels.observationCount'), unit: '', previous: data.previousObservationCount, current: data.currentObservationCount, rate: data.observationChangeRate },
    { label: t('fire.labels.averageFrp'), unit: 'MW', previous: data.previousAverageFrp, current: data.currentAverageFrp, rate: data.averageFrpChangeRate },
    { label: t('fire.labels.maximumFrp'), unit: 'MW', previous: data.previousMaximumFrp, current: data.currentMaximumFrp, rate: null },
  ] : []
  return <PreviewShell title={t('fire.titles.comparison')} context={context(regionName, config, t)} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
      {data && <><div className="fire-comparison-periods">
        <span>{t('document.previous')} {data.previousFromPeriod} – {data.previousToPeriod}</span><span>{t('document.current')} {data.currentFromPeriod} – {data.currentToPeriod}</span>
      </div><div className="fire-comparison-legend"><span><i />{t('fire.previousPeriod')}</span><span><i />{t('fire.currentPeriod')}</span></div>
      <div className="fire-comparison-chart">{metrics.map((metric) => {
        const maximum = Math.max(metric.previous ?? 0, metric.current ?? 0, 1)
        return <article key={metric.label}>
          <div className="fire-comparison-bars">
            <div><b>{metric.previous?.toLocaleString(localeFor(i18n.resolvedLanguage), { maximumFractionDigits: 1 }) ?? '-'}</b>
              <i style={{ height: `${comparisonHeight(metric.previous, maximum)}%` }} /></div>
            <div><b>{metric.current?.toLocaleString(localeFor(i18n.resolvedLanguage), { maximumFractionDigits: 1 }) ?? '-'}</b>
              <i style={{ height: `${comparisonHeight(metric.current, maximum)}%` }} /></div>
          </div>
          <strong>{metric.label}</strong><small>{metric.unit}{metric.rate != null ? ` · ${change(metric.rate, t)}` : ''}</small>
        </article>
      })}</div><div className="fire-summary-grid fire-comparison-grid">
        <article><span>{t('fire.labels.observationCount')}</span><strong>{change(data.observationChangeRate, t)}</strong><small>{data.previousObservationCount.toLocaleString(localeFor(i18n.resolvedLanguage))} → {t('common.observations', { count: data.currentObservationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })}</small></article>
        <article><span>{t('fire.labels.averageFrp')}</span><strong>{change(data.averageFrpChangeRate, t)}</strong><small>{data.previousAverageFrp?.toFixed(1) ?? '-'} → {data.currentAverageFrp?.toFixed(1)} MW</small></article>
        <article><span>{t('fire.labels.maximumFrp')}</span><strong>{data.currentMaximumFrp?.toFixed(1) ?? '-'}</strong><small>{t('document.previous')} {data.previousMaximumFrp?.toFixed(1) ?? '-'} MW</small></article>
      </div></>}
    </QueryState>
  </PreviewShell>
}

export function FireHotspotsPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: HotspotConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useFireHotspotsQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title={t('fire.titles.hotspots')} className="fire-hotspot-preview-modal"
    context={<>{context(regionName, config, t)}<span>{config.gridMeters / 1000}km</span></>} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-hotspot-preview-layout">
        <div className="fire-hotspot-map-column">
          <div className="fire-hotspot-map-stage">
            <KoreaMap active focusBounds={bounds} selection={bounds} hotspots={rows} hotspotGridMeters={config.gridMeters} />
            <button className="fire-hotspot-map-close" type="button" onClick={onClose} aria-label={t('fire.hotspotClose')}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <SatelliteMapAttribution />
          <p className="fire-hotspot-map-note">{t('fire.hotspotMapNote', { grid: config.gridMeters / 1000 })}</p>
        </div>
        <div className="fire-hotspot-list">{rows.slice(0, 5).map((row) => <article key={row.hotspotRank}>
          <span>#{row.hotspotRank}</span><div><strong>{t('common.observations', { count: row.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })}</strong>
            <small>{t('fire.labels.averageFrp')} {row.averageFrp.toFixed(1)} · {t('fire.labels.maximumFrp')} {row.maximumFrp.toFixed(1)} MW</small></div>
        </article>)}</div>
      </div>
    </QueryState>
  </PreviewShell>
}
