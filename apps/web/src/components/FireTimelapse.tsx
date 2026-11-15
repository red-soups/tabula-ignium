import { useTranslation } from 'react-i18next'

export function FireTimelapseLabel({ year, index, count, through }: {
  year: number
  index: number
  count: number
  through: string
}) {
  const { t } = useTranslation()
  const partial = through.startsWith(String(year))
  return <div className="fire-timelapse-label" aria-hidden="true">
    <small>{t('fire.satelliteYears', { count: count - 1 })}</small>
    <strong>{year}</strong>
    {partial && <span>{t('fire.throughDate', { month: Number(through.slice(5, 7)), day: Number(through.slice(8)) })}</span>}
    <i><b style={{ width: `${(index + 1) / count * 100}%` }} /></i>
  </div>
}
