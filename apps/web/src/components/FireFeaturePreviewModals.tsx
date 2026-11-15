import { useEffect, type ReactNode } from 'react'
import type { AnalysisBounds, ConfidenceConfig, FirePointsConfig, MonthlyTrendConfig } from '../api/fireData'
import {
  useConfidenceDistributionQuery, useFirePointsQuery, useMonthlyFireTrendQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'
import { KoreaMap, SatelliteMapAttribution } from './KoreaMap'

export function PreviewShell({ title, context, onClose, children }: {
  title: string
  context: ReactNode
  onClose: () => void
  children: ReactNode
}) {
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
    <section className="fire-preview-modal" role="dialog" aria-modal="true" aria-label={title}>
      <header className="fire-preview-head"><div><span>데이터 미리보기</span><h2>{title}</h2></div>
        <button type="button" aria-label="미리보기 닫기" onClick={onClose}><Icon name="close" /></button></header>
      <div className="fire-preview-context">{context}</div>
      <div className="fire-preview-body">{children}</div>
      <footer className="fire-preview-foot"><button type="button" onClick={onClose}>닫기</button>
        <button className="is-primary" type="button" onClick={onClose}>이 설정 적용</button></footer>
    </section>
  </div>
}

export function QueryState({ pending, error, empty, children }: {
  pending: boolean
  error: boolean
  empty: boolean
  children: ReactNode
}) {
  if (pending) return <p className="fire-preview-status">화재 데이터를 불러오는 중입니다…</p>
  if (error) return <p className="fire-preview-error" role="alert">화재 데이터를 불러오지 못했습니다.</p>
  if (empty) return <p className="fire-preview-status">설정한 조건에 해당하는 데이터가 없습니다.</p>
  return children
}

export function FirePointsPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: FirePointsConfig; onClose: () => void
}) {
  const query = useFirePointsQuery(bounds, config)
  const points = query.data ?? []
  const [year, month] = config.period.split('-').map(Number)
  const rangeStart = new Date(year, month - 6, 1)
  const fromPeriod = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, '0')}`

  return <PreviewShell title="화재 관측 위치" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{fromPeriod} – {config.period}</span>
    <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
    <span>{config.confidenceLevel === 'ALL' ? '전체 신뢰도' : config.confidenceLevel}</span>
  </>}>
    <div className="fire-point-map">
      <div className="fire-point-map-stage">
        <KoreaMap active focusBounds={bounds} selection={bounds} observations={points} observationPeriod={config.period} />
      </div>
      <SatelliteMapAttribution />
      {query.isSuccess && points.length > 0 &&
        <div className="fire-point-map-foot"><strong>{points.length.toLocaleString('ko-KR')}건</strong><span>색상은 관측 월, 점 크기는 FRP를 나타냅니다.</span></div>
      }
    </div>
    <QueryState pending={query.isPending} error={query.isError} empty={query.isSuccess && points.length === 0}>
      {null}
    </QueryState>
  </PreviewShell>
}

const METRIC_LABELS = {
  observationCount: '관측 건수', totalFrp: '전체 FRP', averageFrp: '평균 FRP',
} as const

export function MonthlyTrendPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: MonthlyTrendConfig; onClose: () => void
}) {
  const query = useMonthlyFireTrendQuery(bounds, config)
  const rows = query.data ?? []
  const maximum = Math.max(...rows.map((row) => row[config.metric]), 1)
  return <PreviewShell title="월별 관측 추이" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{METRIC_LABELS[config.metric]}</span><span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y축 · {METRIC_LABELS[config.metric]}</span><span>X축 · 관측 월</span></div>
      <div className="fire-monthly-chart">
        {rows.map((row) => <div className="fire-monthly-column" key={row.period}>
          <span>{Number(row[config.metric]).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</span>
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
  const query = useConfidenceDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title="관측 신뢰도" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y축 · 신뢰도 등급</span><span>X축 · 관측 비율 (%)</span></div>
      <div className="fire-confidence-chart">{rows.map((row) => <article key={row.confidenceLevel}>
        <header><strong>{row.confidenceLevel}</strong><span>{row.observationCount.toLocaleString('ko-KR')}건 · {row.percentage.toFixed(1)}%</span></header>
        <div><i style={{ width: `${row.percentage}%` }} /></div>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}
