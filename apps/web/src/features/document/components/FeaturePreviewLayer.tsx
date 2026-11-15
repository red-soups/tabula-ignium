import { DayNightPreviewModal, FireHotspotsPreviewModal, FireIntensityPreviewModal, PeriodComparisonPreviewModal } from '../../../components/FireAdvancedPreviewModals'
import { ConfidencePreviewModal, FirePointsPreviewModal, MonthlyTrendPreviewModal } from '../../../components/FireFeaturePreviewModals'
import { HighRiskPreviewModal, LargeFirePreviewModal, NearestFirePreviewModal, YearlyTrendPreviewModal } from '../../../components/FireReportPreviewModals'
import { FireSummaryPreviewModal } from '../../../components/FireSummaryPreviewModal'
import type { MapSelection } from '../../../components/KoreaMap'
import type { DocumentFeatureConfigs } from '../documentConfig'

type FeaturePreviewLayerProps = {
  bounds: MapSelection | null
  featureCode: string | null
  configs: DocumentFeatureConfigs
  onClose: () => void
}

export function FeaturePreviewLayer({ bounds, featureCode, configs, onClose }: FeaturePreviewLayerProps) {
  if (!bounds || !featureCode) return null

  const common = { bounds, regionName: '선택한 분석 범위', onClose }

  switch (featureCode) {
    case 'FIRE_SUMMARY':
      return <FireSummaryPreviewModal {...common} config={configs.summary} />
    case 'FIRE_LOCATION_MAP':
      return <FirePointsPreviewModal {...common} config={configs.points} />
    case 'MONTHLY_FIRE_TREND':
      return <MonthlyTrendPreviewModal {...common} config={configs.monthly} />
    case 'CONFIDENCE_ANALYSIS':
      return <ConfidencePreviewModal {...common} config={configs.confidence} />
    case 'YEARLY_FIRE_TREND':
      return <YearlyTrendPreviewModal {...common} />
    case 'LARGE_FIRE_FREQUENCY':
      return <LargeFirePreviewModal {...common} />
    case 'HIGH_RISK_SEASON':
      return <HighRiskPreviewModal {...common} />
    case 'NEAREST_FIRE':
      return <NearestFirePreviewModal {...common}
        fromPeriod={configs.nearest.fromPeriod} toPeriod={configs.nearest.toPeriod} />
    case 'FIRE_INTENSITY':
      return <FireIntensityPreviewModal {...common} config={configs.intensity} />
    case 'DAY_NIGHT_COMPARISON':
      return <DayNightPreviewModal {...common} config={configs.dayNight} />
    case 'PERIOD_COMPARISON':
      return <PeriodComparisonPreviewModal {...common} config={configs.comparison} />
    case 'FIRE_HOTSPOTS':
      return <FireHotspotsPreviewModal {...common} config={configs.hotspots} />
    default:
      return null
  }
}
