import {
  useHighRiskMonthsQuery, useLargeFireFrequencyQuery, useNearestFireQuery,
  useYearlyFireTrendQuery,
} from '../api/fireDataQueries'
import type { AnalysisBounds } from '../api/fireData'
import { PreviewShell, QueryState } from './FireFeaturePreviewModals'

export function YearlyTrendPreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const query = useYearlyFireTrendQuery(bounds)
  const rows = query.data?.filter((row) => row.complete) ?? []
  const recent = rows.slice(-15)
  const maximum = Math.max(...recent.map((row) => row.harmonized), 1)
  return <PreviewShell title="연도별 화재 추이" onClose={onClose}
    context={<><strong>{regionName}</strong><span>보정 관측값</span><span>완료 연도</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y축 · 보정 화재 관측값</span><span>X축 · 관측 연도</span></div>
      <div className="fire-monthly-chart fire-yearly-chart">{recent.map((row) => <div className="fire-monthly-column" key={row.year}>
        <span>{row.harmonized.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</span>
        <i style={{ height: `${Math.max(3, row.harmonized / maximum * 100)}%` }} />
        <small>{row.year}</small>
      </div>)}</div>
    </QueryState>
  </PreviewShell>
}

export function LargeFirePreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const query = useLargeFireFrequencyQuery(bounds)
  const data = query.data
  return <PreviewShell title="큰 산불 발생 빈도" onClose={onClose}
    context={<><strong>{regionName}</strong><span>2001–2025</span><span>보정 관측값 기준</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
      {data && <><div className="fire-summary-grid fire-frequency-summary">
        <article><span>발생 연도</span><strong>{data.occurrenceYearCount}</strong><small>개년</small></article>
        <article><span>평균 재현 주기</span><strong>{data.returnPeriodYears?.toFixed(1) ?? '-'}</strong><small>년</small></article>
        <article><span>화재 관측 연도</span><strong>{data.yearsWithAnyFire}</strong><small>개년</small></article>
      </div><div className="fire-largest-months">{data.largestMonths.map((month, index) => <article key={month.period}>
        <span>#{index + 1}</span><strong>{month.period}</strong><small>보정값 {month.harmonized.toFixed(1)} · 평년 대비 {month.timesNormal?.toFixed(1) ?? '-'}배</small>
      </article>)}</div></>}
    </QueryState>
  </PreviewShell>
}

export function HighRiskPreviewModal({ bounds, regionName, onClose }: {
  bounds: AnalysisBounds; regionName: string; onClose: () => void
}) {
  const query = useHighRiskMonthsQuery(bounds)
  const rows = query.data ?? []
  const maximum = Math.max(...rows.map((row) => row.share), 0.01)
  return <PreviewShell title="고위험 시기" onClose={onClose}
    context={<><strong>{regionName}</strong><span>2003–2023 평년</span><span>월별 위험 비중</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y축 · 평년 위험 비중 (%)</span><span>X축 · 월</span></div>
      <div className="fire-risk-grid">{rows.map((row) => <article className={row.highRisk ? 'is-high-risk' : ''} key={row.month}>
        <strong>{row.month}월</strong><i style={{ height: `${Math.max(4, row.share / maximum * 100)}%` }} />
        <span>{(row.share * 100).toFixed(1)}%</span>{row.highRisk && <small>고위험</small>}
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function NearestFirePreviewModal({ bounds, regionName, fromPeriod, toPeriod, onClose }: {
  bounds: AnalysisBounds; regionName: string; fromPeriod: string; toPeriod: string; onClose: () => void
}) {
  const query = useNearestFireQuery(bounds, fromPeriod, toPeriod)
  const fire = query.data
  return <PreviewShell title="가장 가까운 화재" onClose={onClose}
    context={<><strong>{regionName}</strong><span>{fromPeriod} – {toPeriod}</span><span>선택 범위 중심 기준</span></>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !fire}>
      {fire && <><div className="fire-nearest-main"><span>가장 가까운 관측 거리</span>
        <strong>{fire.distanceKm.toFixed(2)}<small> km</small></strong>
        <p>{fire.sensor} · FRP {fire.frp.toFixed(2)} · {fire.confidenceLevel}</p></div>
        <div className="fire-nearest-radius">
          <article><span>1km 이내</span><strong>{fire.within1Km}</strong></article>
          <article><span>5km 이내</span><strong>{fire.within5Km}</strong></article>
          <article><span>10km 이내</span><strong>{fire.within10Km}</strong></article>
        </div></>}
    </QueryState>
  </PreviewShell>
}
