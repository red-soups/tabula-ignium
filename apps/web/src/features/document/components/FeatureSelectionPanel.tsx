import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeatureOption } from '../../../api/features'
import type {
  FirePointsConfig,
  FireSummaryConfig,
  HotspotConfig,
  MonthlyTrendConfig,
  PeriodAnalysisConfig,
} from '../../../api/fireData'
import { Icon, type IconName } from '../../../components/Icon'
import { localizedFeature } from '../../../i18n/features'
import {
  periodMonthCount,
  shiftPeriod,
  type DocumentFeatureConfigs,
} from '../documentConfig'

const FEATURE_ICONS: Record<string, IconName> = {
  FIRE_SUMMARY: 'file',
  FIRE_LOCATION_MAP: 'pin',
  MONTHLY_FIRE_TREND: 'bars',
  CONFIDENCE_ANALYSIS: 'gauge',
  YEARLY_FIRE_TREND: 'trend',
  LARGE_FIRE_FREQUENCY: 'flame',
  HIGH_RISK_SEASON: 'calendar',
  NEAREST_FIRE: 'target',
  FIRE_INTENSITY: 'zap',
  DAY_NIGHT_COMPARISON: 'daynight',
  PERIOD_COMPARISON: 'swap',
  FIRE_HOTSPOTS: 'grid',
}

type ConfigSetters = {
  [Key in keyof DocumentFeatureConfigs]: Dispatch<SetStateAction<DocumentFeatureConfigs[Key]>>
}

type FeatureSelectionPanelProps = {
  features?: FeatureOption[]
  isPending: boolean
  isError: boolean
  selectedFeatureIds: number[]
  hasSelection: boolean
  documentName: string
  configs: DocumentFeatureConfigs
  configSetters: ConfigSetters
  showHistoryButton: boolean
  onToggleFeature: (id: number) => void
  onPreviewFeature: (code: string) => void
  onDocumentNameChange: (name: string) => void
  onOpenDocumentPreview: () => void
  onOpenHistory: () => void
}

function PeriodAnalysisFields({ config, onChange, gridMeters, onGridChange }: {
  config: PeriodAnalysisConfig
  onChange: (config: PeriodAnalysisConfig) => void
  gridMeters?: HotspotConfig['gridMeters']
  onGridChange?: (gridMeters: HotspotConfig['gridMeters']) => void
}) {
  const { t } = useTranslation()
  return <div className="workspace-feature-fields">
    <label><span>{t('feature.fromMonth')}</span><input type="month" value={config.fromPeriod}
      onChange={(event) => onChange({ ...config, fromPeriod: event.target.value })} /></label>
    <label><span>{t('feature.toMonth')}</span><input type="month" value={config.toPeriod}
      onChange={(event) => onChange({ ...config, toPeriod: event.target.value })} /></label>
    <label><span>{t('feature.sensor')}</span><select value={config.sensor}
      onChange={(event) => onChange({ ...config, sensor: event.target.value as PeriodAnalysisConfig['sensor'] })}>
      <option value="ALL">{t('common.all')}</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
    </select></label>
    {gridMeters && onGridChange && <label><span>{t('feature.gridSize')}</span><select value={gridMeters}
      onChange={(event) => onGridChange(Number(event.target.value) as HotspotConfig['gridMeters'])}>
      <option value={2500}>2.5km</option><option value={5000}>5km</option><option value={10000}>10km</option>
    </select></label>}
  </div>
}

export function FeatureSelectionPanel({
  features,
  isPending,
  isError,
  selectedFeatureIds,
  hasSelection,
  documentName,
  configs,
  configSetters,
  showHistoryButton,
  onToggleFeature,
  onPreviewFeature,
  onDocumentNameChange,
  onOpenDocumentPreview,
  onOpenHistory,
}: FeatureSelectionPanelProps) {
  const { t } = useTranslation()
  const { summary, points, monthly, confidence, nearest, intensity, dayNight, comparison, hotspots } = configs
  const monthlyPeriodInvalid = monthly.fromPeriod > monthly.toPeriod
    || periodMonthCount(monthly.fromPeriod, monthly.toPeriod) > 12
  const selectedMonthlyPeriodInvalid = monthlyPeriodInvalid
    && features?.some((feature) => selectedFeatureIds.includes(feature.id) && feature.code === 'MONTHLY_FIRE_TREND')

  return <div className="workspace-features">
    <div className="workspace-features-intro"><span>{t('feature.step')}</span><h2>{t('feature.title')}</h2>
      <p>{t('feature.description')}</p></div>
    {isPending && <p className="workspace-feature-state" role="status">{t('feature.loading')}</p>}
    {isError && <p className="workspace-feature-error" role="alert">{t('feature.loadError')}</p>}
    <div className="workspace-feature-grid">{features?.map((feature, index) => {
      const selected = selectedFeatureIds.includes(feature.id)
      const isSummary = feature.code === 'FIRE_SUMMARY'
      const isPoints = feature.code === 'FIRE_LOCATION_MAP'
      const isMonthly = feature.code === 'MONTHLY_FIRE_TREND'
      const isConfidence = feature.code === 'CONFIDENCE_ANALYSIS'
      const isYearly = feature.code === 'YEARLY_FIRE_TREND'
      const isLargeFire = feature.code === 'LARGE_FIRE_FREQUENCY'
      const isHighRisk = feature.code === 'HIGH_RISK_SEASON'
      const isNearest = feature.code === 'NEAREST_FIRE'
      const isIntensity = feature.code === 'FIRE_INTENSITY'
      const isDayNight = feature.code === 'DAY_NIGHT_COMPARISON'
      const isPeriodComparison = feature.code === 'PERIOD_COMPARISON'
      const isHotspots = feature.code === 'FIRE_HOTSPOTS'
      const isAdvanced = isIntensity || isDayNight || isPeriodComparison || isHotspots
      const hasSettings = isSummary || isPoints || isMonthly || isConfidence
        || isYearly || isLargeFire || isHighRisk || isNearest || isAdvanced
      const advancedConfig = isIntensity ? intensity
        : isDayNight ? dayNight : isPeriodComparison ? comparison : hotspots
      const invalidPeriod = isMonthly
        ? monthlyPeriodInvalid
        : isConfidence
          ? confidence.fromPeriod > confidence.toPeriod
          : isAdvanced
            ? advancedConfig.fromPeriod > advancedConfig.toPeriod
            : summary.fromPeriod > summary.toPeriod

      const displayFeature = localizedFeature(feature, t)
      return <article key={feature.id} className={`workspace-feature-card${selected ? ' is-selected' : ''}${selected && hasSettings ? ' has-settings' : ''}`}>
        <label className="workspace-feature-toggle">
          <input type="checkbox" checked={selected} onChange={() => onToggleFeature(feature.id)} />
          <span className="workspace-feature-symbol"><Icon name={FEATURE_ICONS[feature.code] ?? 'file'} size={22} /></span>
          <span className="workspace-feature-number">{String(index + 1).padStart(2, '0')}</span>
          <strong>{displayFeature.name}</strong><small>{displayFeature.description}</small>
          <span className="workspace-feature-check"><Icon name="check" size={14} /></span>
        </label>

        {selected && isSummary && <div className="workspace-feature-settings">
          <div className="workspace-feature-fields">
            <label><span>{t('feature.fromMonth')}</span><input type="month" value={summary.fromPeriod}
              onChange={(event) => configSetters.summary((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.toMonth')}</span><input type="month" value={summary.toPeriod}
              onChange={(event) => configSetters.summary((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.sensor')}</span><select value={summary.sensor}
              onChange={(event) => configSetters.summary((current) => ({ ...current, sensor: event.target.value as FireSummaryConfig['sensor'] }))}>
              <option value="ALL">{t('common.all')}</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
            </select></label>
            <label><span>{t('feature.confidence')}</span><select value={summary.confidenceLevel}
              onChange={(event) => configSetters.summary((current) => ({ ...current, confidenceLevel: event.target.value as FireSummaryConfig['confidenceLevel'] }))}>
              <option value="ALL">{t('common.all')}</option><option value="high">high</option><option value="nominal">nominal</option><option value="low">low</option>
            </select></label>
          </div>
          {invalidPeriod && <small className="workspace-feature-validation" role="alert">{t('feature.invalidPeriod')}</small>}
          <PreviewButton disabled={invalidPeriod || !hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && isPoints && <div className="workspace-feature-settings">
          <div className="workspace-feature-fields">
            <label><span>{t('feature.baseMonth')}</span><input type="month" value={points.period}
              onChange={(event) => configSetters.points((current) => ({ ...current, period: event.target.value }))} /></label>
            <label><span>{t('feature.sensor')}</span><select value={points.sensor}
              onChange={(event) => configSetters.points((current) => ({ ...current, sensor: event.target.value as FirePointsConfig['sensor'] }))}>
              <option value="ALL">{t('common.all')}</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
            </select></label>
            <label><span>{t('feature.confidence')}</span><select value={points.confidenceLevel}
              onChange={(event) => configSetters.points((current) => ({ ...current, confidenceLevel: event.target.value as FirePointsConfig['confidenceLevel'] }))}>
              <option value="ALL">{t('common.all')}</option><option value="high">high</option><option value="nominal">nominal</option><option value="low">low</option>
            </select></label>
          </div>
          <p className="workspace-feature-note">{t('feature.sixMonthNote')}</p>
          <PreviewButton disabled={!points.period || !hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && isMonthly && <div className="workspace-feature-settings">
          <div className="workspace-feature-fields">
            <label><span>{t('feature.fromMonth')}</span><input type="month" value={monthly.fromPeriod}
              min={shiftPeriod(monthly.toPeriod, -11)} max={monthly.toPeriod}
              onChange={(event) => configSetters.monthly((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.toMonth')}</span><input type="month" value={monthly.toPeriod}
              min={monthly.fromPeriod} max={shiftPeriod(monthly.fromPeriod, 11)}
              onChange={(event) => configSetters.monthly((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.sensor')}</span><select value={monthly.sensor}
              onChange={(event) => configSetters.monthly((current) => ({ ...current, sensor: event.target.value as MonthlyTrendConfig['sensor'] }))}>
              <option value="ALL">{t('common.all')}</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
            </select></label>
            <label><span>{t('feature.metric')}</span><select value={monthly.metric}
              onChange={(event) => configSetters.monthly((current) => ({ ...current, metric: event.target.value as MonthlyTrendConfig['metric'] }))}>
              <option value="observationCount">{t('feature.metrics.observationCount')}</option><option value="totalFrp">{t('feature.metrics.totalFrp')}</option><option value="averageFrp">{t('feature.metrics.averageFrp')}</option>
            </select></label>
          </div>
          {invalidPeriod && <small className="workspace-feature-validation" role="alert">
            {monthly.fromPeriod > monthly.toPeriod ? t('feature.invalidPeriod') : t('feature.maxTwelveMonths')}
          </small>}
          <PreviewButton disabled={invalidPeriod || !hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && isConfidence && <div className="workspace-feature-settings">
          <div className="workspace-feature-fields">
            <label><span>{t('feature.fromMonth')}</span><input type="month" value={confidence.fromPeriod}
              onChange={(event) => configSetters.confidence((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.toMonth')}</span><input type="month" value={confidence.toPeriod}
              onChange={(event) => configSetters.confidence((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.sensor')}</span><select value={confidence.sensor}
              onChange={(event) => configSetters.confidence((current) => ({ ...current, sensor: event.target.value as typeof confidence.sensor }))}>
              <option value="ALL">{t('common.all')}</option><option value="MODIS">MODIS</option><option value="VIIRS">VIIRS</option>
            </select></label>
          </div>
          {invalidPeriod && <small className="workspace-feature-validation" role="alert">{t('feature.invalidPeriod')}</small>}
          <PreviewButton disabled={invalidPeriod || !hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && (isYearly || isLargeFire || isHighRisk) && <div className="workspace-feature-settings">
          <p className="workspace-feature-note">{t('feature.correctedNote')}</p>
          <PreviewButton disabled={!hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && isNearest && <div className="workspace-feature-settings">
          <div className="workspace-feature-fields">
            <label><span>{t('feature.fromMonth')}</span><input type="month" value={nearest.fromPeriod}
              onChange={(event) => configSetters.nearest((current) => ({ ...current, fromPeriod: event.target.value }))} /></label>
            <label><span>{t('feature.toMonth')}</span><input type="month" value={nearest.toPeriod}
              onChange={(event) => configSetters.nearest((current) => ({ ...current, toPeriod: event.target.value }))} /></label>
          </div>
          {nearest.fromPeriod > nearest.toPeriod && <small className="workspace-feature-validation" role="alert">{t('feature.invalidPeriod')}</small>}
          <PreviewButton disabled={!hasSelection || nearest.fromPeriod > nearest.toPeriod} onClick={() => onPreviewFeature(feature.code)} />
        </div>}

        {selected && isAdvanced && <div className="workspace-feature-settings">
          {isIntensity && <p className="workspace-feature-note">
            {t('feature.intensityNote')}
          </p>}
          <PeriodAnalysisFields config={advancedConfig}
            gridMeters={isHotspots ? hotspots.gridMeters : undefined}
            onGridChange={isHotspots ? (gridMeters) => configSetters.hotspots((current) => ({ ...current, gridMeters })) : undefined}
            onChange={(config) => {
              if (isIntensity) configSetters.intensity(config)
              else if (isDayNight) configSetters.dayNight(config)
              else if (isPeriodComparison) configSetters.comparison(config)
              else configSetters.hotspots((current) => ({ ...current, ...config }))
            }} />
          {invalidPeriod && <small className="workspace-feature-validation" role="alert">{t('feature.invalidPeriod')}</small>}
          <PreviewButton disabled={invalidPeriod || !hasSelection} onClick={() => onPreviewFeature(feature.code)} />
        </div>}
      </article>
    })}</div>
    <div className="workspace-document-create">
      <div className="workspace-features-foot"><strong>{t('feature.selectedCount', { count: selectedFeatureIds.length })}</strong><span>{t('feature.layoutNote')}</span></div>
      <label><span>{t('feature.documentName')}</span><input value={documentName} maxLength={200}
        onChange={(event) => onDocumentNameChange(event.target.value)} placeholder={t('feature.documentNamePlaceholder')} /></label>
      {showHistoryButton && <button className="is-history" type="button" onClick={onOpenHistory}>{t('feature.history')}</button>}
      <button type="button" disabled={!hasSelection || selectedFeatureIds.length === 0 || !documentName.trim() || Boolean(selectedMonthlyPeriodInvalid)}
        onClick={onOpenDocumentPreview}>{t('feature.documentPreview')} <Icon name="chevron" size={18} /></button>
    </div>
  </div>
}

function PreviewButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return <button className="workspace-preview-button" type="button" disabled={disabled} onClick={onClick}>
    {t('common.preview')} <Icon name="chevron" size={16} />
  </button>
}
