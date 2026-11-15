import type { AnalysisBounds, HotspotConfig, PeriodAnalysisConfig } from '../api/fireData'
import {
  useDayNightDistributionQuery, useFireHotspotsQuery,
  useFireIntensityQuery, usePeriodComparisonQuery,
} from '../api/fireDataQueries'
import { Icon } from './Icon'
import { PreviewShell, QueryState } from './FireFeaturePreviewModals'
import { KoreaMap, SatelliteMapAttribution } from './KoreaMap'

function context(regionName: string, config: PeriodAnalysisConfig) {
  return <><strong>{regionName}</strong><span>{config.fromPeriod} – {config.toPeriod}</span>
    <span>{config.sensor === 'ALL' ? '전체 센서' : config.sensor}</span></>
}

function change(value: number | null) {
  if (value == null) return '비교 불가'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function comparisonHeight(value: number | null, maximum: number) {
  if (value == null || maximum <= 0) return 0
  return Math.max(4, value / maximum * 100)
}

export function FireIntensityPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const query = useFireIntensityQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title="화재 강도 등급" context={context(regionName, config)} onClose={onClose}>
    <div className="fire-intensity-criteria" aria-label="화재 강도 등급 기준">
      <strong>FRP 등급 기준</strong>
      <span><i className="is-low" />약함 <b>10 MW 미만</b></span>
      <span><i className="is-moderate" />보통 <b>10–30 MW 미만</b></span>
      <span><i className="is-high" />강함 <b>30–100 MW 미만</b></span>
      <span><i className="is-extreme" />매우 강함 <b>100 MW 이상</b></span>
    </div>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-chart-axis"><span>Y축 · FRP 강도 등급</span><span>X축 · 관측 비율 (%)</span></div>
      <div className="fire-confidence-chart">{rows.map((row) => <article key={row.intensityLevel}>
        <header><strong>{row.intensityLevel}</strong><span>{row.observationCount.toLocaleString('ko-KR')}건 · 평균 {row.averageFrp.toFixed(1)} MW</span></header>
        <div><i style={{ width: `${row.percentage}%` }} /></div>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function DayNightPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const query = useDayNightDistributionQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title="주·야간 화재 비교" context={context(regionName, config)} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-summary-grid fire-day-night-grid">{rows.map((row) => <article key={row.periodType}>
        <span>{row.periodType} 관측</span><strong>{row.observationCount.toLocaleString('ko-KR')}</strong><small>{row.percentage.toFixed(1)}%</small>
        <p>평균 FRP {row.averageFrp.toFixed(1)} · 최대 {row.maximumFrp.toFixed(1)}</p>
      </article>)}</div>
    </QueryState>
  </PreviewShell>
}

export function PeriodComparisonPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: PeriodAnalysisConfig; onClose: () => void
}) {
  const query = usePeriodComparisonQuery(bounds, config)
  const data = query.data
  const metrics = data ? [
    { label: '관측 건수', unit: '건', previous: data.previousObservationCount, current: data.currentObservationCount, rate: data.observationChangeRate },
    { label: '평균 FRP', unit: 'MW', previous: data.previousAverageFrp, current: data.currentAverageFrp, rate: data.averageFrpChangeRate },
    { label: '최대 FRP', unit: 'MW', previous: data.previousMaximumFrp, current: data.currentMaximumFrp, rate: null },
  ] : []
  return <PreviewShell title="이전 기간 비교" context={context(regionName, config)} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && !data}>
      {data && <><div className="fire-comparison-periods">
        <span>이전 {data.previousFromPeriod} – {data.previousToPeriod}</span><span>현재 {data.currentFromPeriod} – {data.currentToPeriod}</span>
      </div><div className="fire-comparison-legend"><span><i />이전 기간</span><span><i />현재 기간</span></div>
      <div className="fire-comparison-chart">{metrics.map((metric) => {
        const maximum = Math.max(metric.previous ?? 0, metric.current ?? 0, 1)
        return <article key={metric.label}>
          <div className="fire-comparison-bars">
            <div><b>{metric.previous?.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) ?? '-'}</b>
              <i style={{ height: `${comparisonHeight(metric.previous, maximum)}%` }} /></div>
            <div><b>{metric.current?.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) ?? '-'}</b>
              <i style={{ height: `${comparisonHeight(metric.current, maximum)}%` }} /></div>
          </div>
          <strong>{metric.label}</strong><small>{metric.unit}{metric.rate != null ? ` · ${change(metric.rate)}` : ''}</small>
        </article>
      })}</div><div className="fire-summary-grid fire-comparison-grid">
        <article><span>관측 건수</span><strong>{change(data.observationChangeRate)}</strong><small>{data.previousObservationCount.toLocaleString('ko-KR')} → {data.currentObservationCount.toLocaleString('ko-KR')}건</small></article>
        <article><span>평균 FRP</span><strong>{change(data.averageFrpChangeRate)}</strong><small>{data.previousAverageFrp?.toFixed(1) ?? '-'} → {data.currentAverageFrp?.toFixed(1)} MW</small></article>
        <article><span>최대 FRP</span><strong>{data.currentMaximumFrp?.toFixed(1) ?? '-'}</strong><small>이전 {data.previousMaximumFrp?.toFixed(1) ?? '-'} MW</small></article>
      </div></>}
    </QueryState>
  </PreviewShell>
}

export function FireHotspotsPreviewModal({ bounds, regionName, config, onClose }: {
  bounds: AnalysisBounds; regionName: string; config: HotspotConfig; onClose: () => void
}) {
  const query = useFireHotspotsQuery(bounds, config)
  const rows = query.data ?? []
  return <PreviewShell title="화재 집중 구역" className="fire-hotspot-preview-modal"
    context={<>{context(regionName, config)}<span>{config.gridMeters / 1000}km 격자</span></>} onClose={onClose}>
    <QueryState pending={query.isPending} error={query.isError} empty={!query.isPending && rows.length === 0}>
      <div className="fire-hotspot-preview-layout">
        <div className="fire-hotspot-map-column">
          <div className="fire-hotspot-map-stage">
            <KoreaMap active focusBounds={bounds} selection={bounds} hotspots={rows} hotspotGridMeters={config.gridMeters} />
            <button className="fire-hotspot-map-close" type="button" onClick={onClose} aria-label="화재 집중 구역 지도 닫기">
              <Icon name="close" size={18} />
            </button>
          </div>
          <SatelliteMapAttribution />
          <p className="fire-hotspot-map-note">각 사각형은 {config.gridMeters / 1000}km 격자이며, 관측 건수가 많을수록 진한 빨간색으로 표시됩니다.</p>
        </div>
        <div className="fire-hotspot-list">{rows.slice(0, 5).map((row) => <article key={row.hotspotRank}>
          <span>#{row.hotspotRank}</span><div><strong>{row.observationCount.toLocaleString('ko-KR')}건</strong>
            <small>평균 {row.averageFrp.toFixed(1)} · 최대 {row.maximumFrp.toFixed(1)} MW</small></div>
        </article>)}</div>
      </div>
    </QueryState>
  </PreviewShell>
}
