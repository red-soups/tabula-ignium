import { useEffect } from 'react'
import type { AnalysisBounds, FireSummaryConfig } from '../api/fireData'
import { useFireSummaryQuery } from '../api/fireDataQueries'
import { Icon } from './Icon'

function number(value: number | null, maximumFractionDigits = 1) {
  return value === null ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits })
}

function dateTime(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
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
          <div><span>데이터 미리보기</span><h2 id="fire-preview-title">화재 관측 요약</h2></div>
          <button type="button" aria-label="미리보기 닫기" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="fire-preview-context">
          <strong>{regionName}</strong>
          <span>{config.fromPeriod} – {config.toPeriod}</span>
          <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span>
          <span>{config.confidenceLevel === 'ALL' ? '전체 신뢰도' : config.confidenceLevel}</span>
        </div>
        <div className="fire-preview-body">
          {summaryQuery.isPending && <p className="fire-preview-status">화재 데이터를 불러오는 중입니다…</p>}
          {summaryQuery.isError && <p className="fire-preview-error" role="alert">화재 데이터를 불러오지 못했습니다.</p>}
          {summary && <>
            <div className="fire-summary-grid">
              <article><span>관측 건수</span><strong>{number(summary.observationCount, 0)}</strong><small>회</small></article>
              <article><span>관측일 수</span><strong>{number(summary.observedDayCount, 0)}</strong><small>일</small></article>
              <article><span>평균 FRP</span><strong>{number(summary.averageFrp, 2)}</strong><small>MW</small></article>
              <article><span>최대 FRP</span><strong>{number(summary.maximumFrp, 2)}</strong><small>MW</small></article>
              <article><span>전체 FRP</span><strong>{number(summary.totalFrp, 2)}</strong><small>MW</small></article>
            </div>
            <div className="fire-preview-dates">
              <div><span>최초 관측</span><strong>{dateTime(summary.earliestObservation)}</strong></div>
              <div><span>최근 관측</span><strong>{dateTime(summary.latestObservation)}</strong></div>
            </div>
            {summary.observationCount === 0 && <p className="fire-preview-empty">설정한 조건에 해당하는 관측 데이터가 없습니다.</p>}
          </>}
        </div>
        <footer className="fire-preview-foot">
          <button type="button" onClick={onClose}>닫기</button>
          <button className="is-primary" type="button" onClick={onClose}>이 설정 적용</button>
        </footer>
      </section>
    </div>
  )
}
