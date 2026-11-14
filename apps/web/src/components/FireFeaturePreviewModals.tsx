import { useEffect, type ReactNode } from 'react'
import type { ConfidenceConfig, FirePointsConfig, MonthlyTrendConfig } from '../api/fireData'
import {
  useConfidenceDistributionQuery, useFirePointsQuery, useMonthlyFireTrendQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'

function PreviewShell({ title, context, onClose, children }: {
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
      <header className="fire-preview-head"><div><span>FIRE DATA PREVIEW</span><h2>{title}</h2></div>
        <button type="button" aria-label="미리보기 닫기" onClick={onClose}><Icon name="close" /></button></header>
      <div className="fire-preview-context">{context}</div>
      <div className="fire-preview-body">{children}</div>
      <footer className="fire-preview-foot"><button type="button" onClick={onClose}>닫기</button>
        <button className="is-primary" type="button" onClick={onClose}>이 설정 적용</button></footer>
    </section>
  </div>
}

function QueryState({ pending, error, empty, children }: {
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

export function FirePointsPreviewModal({ regionId, regionName, config, onClose }: {
  regionId: number; regionName: string; config: FirePointsConfig; onClose: () => void
}) {
  const query = useFirePointsQuery(regionId, config)
  const points = query.data ?? []
  const west = Math.min(...points.map((point) => point.longitude))
  const east = Math.max(...points.map((point) => point.longitude))
  const south = Math.min(...points.map((point) => point.latitude))
  const north = Math.max(...points.map((point) => point.latitude))
  const longitudeSpan = Math.max(east - west, 0.01)
  const latitudeSpan = Math.max(north - south, 0.01)
  const maximumFrp = Math.max(...points.map((point) => point.frp), 1)

  return <PreviewShell title="화재 관측 위치" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.period}</span>
    <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
    <span>{config.confidenceLevel === 'ALL' ? '전체 신뢰도' : config.confidenceLevel}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && points.length === 0}>
      <div className="fire-point-map">
        <svg viewBox="0 0 600 320" role="img" aria-label={`${regionName} 화재 관측점`}>
          {points.map((point) => {
            const x = 24 + (point.longitude - west) / longitudeSpan * 552
            const y = 24 + (north - point.latitude) / latitudeSpan * 272
            const radius = 2.2 + Math.sqrt(point.frp / maximumFrp) * 7
            return <circle key={point.id} cx={x} cy={y} r={radius}>
              <title>{`${point.sensor} · FRP ${point.frp.toFixed(2)} · ${point.confidenceLevel}`}</title>
            </circle>
          })}
        </svg>
        <div><strong>{points.length.toLocaleString('ko-KR')}건</strong><span>FRP가 높을수록 점이 크게 표시됩니다.</span></div>
      </div>
    </QueryState>
  </PreviewShell>
}

const METRIC_LABELS = {
  observationCount: '관측 건수', totalFrp: '전체 FRP', averageFrp: '평균 FRP',
} as const

export function MonthlyTrendPreviewModal({ regionId, regionName, config, onClose }: {
  regionId: number; regionName: string; config: MonthlyTrendConfig; onClose: () => void
}) {
  const query = useMonthlyFireTrendQuery(regionId, config)
  const rows = query.data ?? []
  const maximum = Math.max(...rows.map((row) => row[config.metric]), 1)
  return <PreviewShell title="월별 관측 추이" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{METRIC_LABELS[config.metric]}</span><span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
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

export function ConfidencePreviewModal({ regionId, regionName, config, onClose }: {
  regionId: number; regionName: string; config: ConfidenceConfig; onClose: () => void
}) {
  const query = useConfidenceDistributionQuery(regionId, config)
  const rows = query.data ?? []
  return <PreviewShell title="관측 신뢰도" onClose={onClose} context={<>
    <strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
  </>}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-confidence-chart">{rows.map((row) => <article key={row.confidenceLevel}>
        <header><strong>{row.confidenceLevel}</strong><span>{row.observationCount.toLocaleString('ko-KR')}건 · {row.percentage.toFixed(1)}%</span></header>
        <div><i style={{ width: `${row.percentage}%` }} /></div>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}
