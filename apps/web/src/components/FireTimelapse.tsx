export function FireTimelapseLabel({ year, index, count, through }: {
  year: number
  index: number
  count: number
  through: string
}) {
  const partial = through.startsWith(String(year))
  return <div className="fire-timelapse-label" aria-hidden="true">
    <small>위성 화재 관측 {count - 1}년 · 센서 차이 보정</small>
    <strong>{year}</strong>
    {partial && <span>{Number(through.slice(5, 7))}월 {Number(through.slice(8))}일까지</span>}
    <i><b style={{ width: `${(index + 1) / count * 100}%` }} /></i>
  </div>
}
