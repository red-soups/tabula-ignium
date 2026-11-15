import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisBounds, ConfidenceConfig, FirePointsConfig, MonthlyTrendConfig } from '../api/fireData'
import {
  useConfidenceDistributionQuery, useFirePointsQuery, useMonthlyFireTrendQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'
import { KoreaMap, SatelliteMapAttribution } from './KoreaMap'
import { localeFor } from '../i18n'

export function PreviewShell({ title, context, className = '', onClose, children }: {
  title: string
  context: ReactNode
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="fire-preview-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className={`fire-preview-modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="fire-preview-head"><div><span>{t('common.preview')}</span><h2>{title}</h2></div>
        <button className="fire-preview-close" type="button" aria-label={t('fire.previewClose')} onClick={onClose}>
          <Icon name="close" /><span>{t('common.close')}</span>
        </button></header>
      <div className="fire-preview-context">{context}</div>
      <div className="fire-preview-body">{children}</div>
      <footer className="fire-preview-foot"><button type="button" onClick={onClose}>{t('common.close')}</button>
        <button className="is-primary" type="button" onClick={onClose}>{t('common.apply')}</button></footer>
    </section>
  </div>
}

export function QueryState({ pending, error, empty, children }: {
  pending: boolean
  error: boolean
  empty: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (pending) return <p className="fire-preview-status">{t('fire.loading')}</p>
  if (error) return <p className="fire-preview-error" role="alert">{t('fire.loadError')}</p>
  if (empty) return <p className="fire-preview-status">{t('fire.empty')}</p>
  return children
}

export function FirePointsPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: FirePointsConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useFirePointsQuery(bounds, config)
  const points = query.data ?? []
  const [year, month] = config.period.split('-').map(Number)
  const rangeStart = new Date(year, month - 6, 1)
  const fromPeriod = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}`

  return <PreviewShell title={t('fire.titles.points')} onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{fromPeriod} – {config.period}</span>
    <span>{config.sensor === 'ALL' ? t('feature.allSensors') : config.sensor}</span>
    <span>{config.confidenceLevel === 'ALL' ? t('feature.allConfidence') : config.confidenceLevel}</span>
  </>}>
    <div className="fire-point-map">
      <div className="fire-point-map-stage">
        <KoreaMap active focusBounds={bounds} selection={bounds} observations={points} observationPeriod={config.period} />
      </div>
      <SatelliteMapAttribution />
      {query.isSuccess && points.length > 0 &&
        <div className="fire-point-map-foot"><strong>{t('common.observations', { count: points.length.toLocaleString(localeFor(i18n.resolvedLanguage)) })}</strong><span>{t('fire.pointsLegend')}</span></div>
      }
    </div>
    <QueryState pending={query.isPending} error={query.isError} empty={query.isSuccess && points.length === 0}>
      {null}
    </QueryState>
  </PreviewShell>
}

export function MonthlyTrendPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: MonthlyTrendConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useMonthlyFireTrendQuery(bounds, config)
  const rows = query.data ?? []
  const maximum = Math.max(...rows.map((row) => row[config.metric]), 1)
  const metricLabel = t(`feature.metrics.${config.metric}`)
  return <PreviewShell title={t('fire.titles.monthly')} onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{metricLabel}</span><span>{config.sensor === 'ALL' ? t('feature.allSensors') : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y · {metricLabel}</span><span>{t('fire.axisXMonth')}</span></div>
      <div className="fire-monthly-chart">
        {rows.map((row) => <div className="fire-monthly-column" key={row.period}>
          <span>{Number(row[config.metric]).toLocaleString(localeFor(i18n.resolvedLanguage), { maximumFractionDigits: 1 })}</span>
          <i style={{ height: `${Math.max(3, row[config.metric] / maximum * 100)}%` }} />
          <small>{row.period.slice(2)}</small>
        </div>)}
      </div>
    </QueryState>
  </PreviewShell>
}

export function ConfidencePreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: ConfidenceConfig; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useConfidenceDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title={t('fire.titles.confidence')} onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{config.sensor === 'ALL' ? t('feature.allSensors') : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>{t('fire.axisYConfidence')}</span><span>{t('fire.axisXRatio')}</span></div>
      <div className="fire-confidence-chart">{rows.map((row) => <article key={row.confidenceLevel}>
        <header><strong>{row.confidenceLevel}</strong><span>{t('common.observations', { count: row.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })} · {row.percentage.toFixed(1)}%</span></header>
        <div><i style={{ width: `${row.percentage}%` }} /></div>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}
