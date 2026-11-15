import {
  useHighRiskMonthsQuery, useLargeFireFrequencyQuery, useNearestFireQuery,
  useYearlyFireTrendQuery,
} from '../api/fireDataQueries'
import { useTranslation } from 'react-i18next'
import type { AnalysisBounds } from '../api/fireData'
import { PreviewShell, QueryState } from './FireFeaturePreviewModals'
import { localeFor } from '../i18n'

export function YearlyTrendPreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const query = useYearlyFireTrendQuery(bounds)
  const rows = query.data?.filter((row) => row.complete) ?? []
  const recent = rows.slice(-15)
  const maximum = Math.max(...recent.map((row) => row.harmonized), 1)
  return <PreviewShell title={t('fire.titles.yearly')} onClose={onClose}
    context={<><strong>{regionName}</strong><span>{t('fire.correctedIndex')}</span><span>{t('fire.completedYears')}</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <aside className="fire-data-explanation" aria-label={t('fire.correctedIndexTitle')}>
        <strong>{t('fire.correctedIndexTitle')}</strong>
        <p>{t('fire.correctedIndexDescription')}</p>
      </aside>
      <div className="fire-chart-axis"><span>Y · {t('fire.correctedIndex')}</span><span>{t('fire.axisXYear')}</span></div>
      <div className="fire-monthly-chart fire-yearly-chart">{recent.map((row) => <div className="fire-monthly-column" key={row.year}>
        <span>{row.harmonized.toLocaleString(localeFor(i18n.resolvedLanguage), { maximumFractionDigits: 1 })}</span>
        <i style={{ height: `${Math.max(3, row.harmonized / maximum * 100)}%` }} />
        <small>{row.year}</small>
      </div>)}</div>
    </QueryState>
  </PreviewShell>
}

export function LargeFirePreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const { t } = useTranslation()
  const query = useLargeFireFrequencyQuery(bounds)
  const data = query.data
  return <PreviewShell title={t('fire.titles.large')} onClose={onClose}
    context={<><strong>{regionName}</strong><span>2001–2025</span><span>{t('fire.harmonizedBasis')}</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
      {data && <><div className="fire-summary-grid fire-frequency-summary">
        <article><span>{t('document.occurrenceYears')}</span><strong>{data.occurrenceYearCount}</strong></article>
        <article><span>{t('document.returnPeriod')}</span><strong>{data.returnPeriodYears?.toFixed(1) ?? '-'}</strong></article>
        <article><span>{t('document.observedYears')}</span><strong>{data.yearsWithAnyFire}</strong></article>
      </div><div className="fire-largest-months">{data.largestMonths.map((month, index) => <article key={month.period}>
        <span>#{index + 1}</span><strong>{month.period}</strong><small>{t('document.harmonizedValue', { value: month.harmonized.toFixed(1) })} · {t('document.timesNormal', { value: month.timesNormal?.toFixed(1) ?? '-' })}</small>
      </article>)}</div></>}
    </QueryState>
  </PreviewShell>
}

export function HighRiskPreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const { t } = useTranslation()
  const query = useHighRiskMonthsQuery(bounds)
  const rows = query.data ?? []
  const maximum = Math.max(...rows.map((row) => row.share), 0.01)
  return <PreviewShell title={t('fire.titles.risk')} onClose={onClose}
    context={<><strong>{regionName}</strong><span>{t('fire.normalPeriod')}</span><span>{t('fire.monthlyRiskShare')}</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>{t('fire.axisYRisk')}</span><span>{t('fire.axisXCalendarMonth')}</span></div>
      <div className="fire-risk-grid">{rows.map((row) => <article className={row.highRisk ? 'is-high-risk' : ''} key={row.month}>
        <strong>{t('document.monthValue', { value: row.month })}</strong><i style={{ height: `${Math.max(4, row.share / maximum * 100)}%` }} />
        <span>{(row.share * 100).toFixed(1)}%</span>{row.highRisk && <small>{t('fire.highRisk')}</small>}
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function NearestFirePreviewModal({ bounds, regionName, fromPeriod, toPeriod, onClose }: {
  bounds: AnalysisBounds; regionName: string; fromPeriod: string; toPeriod: string; onClose: () => void
}) {
  const { t } = useTranslation()
  const query = useNearestFireQuery(bounds, fromPeriod, toPeriod)
  const fire = query.data
  return <PreviewShell title={t('fire.titles.nearest')} onClose={onClose}
    context={<><strong>{regionName}</strong><span>{fromPeriod} – {toPeriod}</span><span>{t('fire.centerBasis')}</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !fire}>
      {fire && <><div className="fire-nearest-main"><span>{t('fire.nearestDistance')}</span>
        <strong>{fire.distanceKm.toFixed(2)}<small> km</small></strong>
        <p>{fire.sensor} · FRP {fire.frp.toFixed(2)} · {fire.confidenceLevel}</p></div>
        <div className="fire-nearest-radius">
          <article><span>{t('fire.withinDistance', { distance: 1 })}</span><strong>{fire.within1Km}</strong></article>
          <article><span>{t('fire.withinDistance', { distance: 5 })}</span><strong>{fire.within5Km}</strong></article>
          <article><span>{t('fire.withinDistance', { distance: 10 })}</span><strong>{fire.within10Km}</strong></article>
        </div></>}
    </QueryState>
  </PreviewShell>
}
