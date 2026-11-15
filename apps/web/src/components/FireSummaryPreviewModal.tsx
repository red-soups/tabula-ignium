import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisBounds, FireSummaryConfig } from '../api/fireData'
import { useFireSummaryQuery } from '../api/fireDataQueries'
import { Icon } from './Icon'
import { localeFor } from '../i18n'

function number(value: number | null, locale: string, maximumFractionDigits = 1) {
  return value === null ? '-' : value.toLocaleString(locale, { maximumFractionDigits })
}

function dateTime(value: string | null, locale: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

export function FireSummaryPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds
  regionName: string
  config: FireSummaryConfig
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = localeFor(i18n.resolvedLanguage)
  const summaryQuery = useFireSummaryQuery(bounds, config)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const summary = summaryQuery.data

  return (
    <div className="fire-preview-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="fire-preview-modal" role="dialog" aria-modal="true" aria-labelledby="fire-preview-title">
        <header className="fire-preview-head">
          <div><span>{t('common.preview')}</span><h2 id="fire-preview-title">{t('fire.titles.summary')}</h2></div>
          <button type="button" aria-label={t('fire.previewClose')} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="fire-preview-context">
          <strong>{regionName}</strong>
          <span>{config.fromPeriod} – {config.toPeriod}</span>
          <span>{config.sensor === 'ALL' ? t('feature.allSensors') : config.sensor}</span>
          <span>{config.confidenceLevel === 'ALL' ? t('feature.allConfidence') : config.confidenceLevel}</span>
        </div>
        <div className="fire-preview-body">
          {summaryQuery.isPending && <p className="fire-preview-status">{t('fire.loading')}</p>}
          {summaryQuery.isError && <p className="fire-preview-error" role="alert">{t('fire.loadError')}</p>}
          {summary && <>
            <div className="fire-summary-grid">
              <article><span>{t('fire.labels.observationCount')}</span><strong>{number(summary.observationCount, locale, 0)}</strong></article>
              <article><span>{t('fire.labels.observedDays')}</span><strong>{number(summary.observedDayCount, locale, 0)}</strong></article>
              <article><span>{t('fire.labels.averageFrp')}</span><strong>{number(summary.averageFrp, locale, 2)}</strong><small>MW</small></article>
              <article><span>{t('fire.labels.maximumFrp')}</span><strong>{number(summary.maximumFrp, locale, 2)}</strong><small>MW</small></article>
              <article><span>{t('fire.labels.totalFrp')}</span><strong>{number(summary.totalFrp, locale, 2)}</strong><small>MW</small></article>
            </div>
            <div className="fire-preview-dates">
              <div><span>{t('fire.labels.earliest')}</span><strong>{dateTime(summary.earliestObservation, locale)}</strong></div>
              <div><span>{t('fire.labels.latest')}</span><strong>{dateTime(summary.latestObservation, locale)}</strong></div>
            </div>
            {summary.observationCount === 0 && <p className="fire-preview-empty">{t('fire.empty')}</p>}
          </>}
        </div>
        <footer className="fire-preview-foot">
          <button type="button" onClick={onClose}>{t('common.close')}</button>
          <button className="is-primary" type="button" onClick={onClose}>{t('common.apply')}</button>
        </footer>
      </section>
    </div>
  )
}
