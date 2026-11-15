import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { RegionGeometry, RegionMap } from '../api/regions'

type Geometry = RegionGeometry

export type MapSelection = {
  west: number
  south: number
  east: number
  north: number
}

const WORLD = 1000
const PADDING = 94
const LON_FACTOR = Math.cos(36 * Math.PI / 180)
const west = 124.613746643
const south = 33.194583894
const east = 130.931243897
const north = 38.618278661

function polygons(geometry: Geometry): number[][][][] {
  return geometry.type === 'MultiPolygon'
    ? geometry.coordinates as number[][][][]
    : [geometry.coordinates as number[][][]]
}

const longitudeSpan = (east - west) * LON_FACTOR
const latitudeSpan = north - south
const scale = (WORLD - PADDING * 2) / Math.max(longitudeSpan, latitudeSpan)
const offsetX = (WORLD - longitudeSpan * scale) / 2
const offsetY = (WORLD - latitudeSpan * scale) / 2
const projectX = (longitude: number) => offsetX + (longitude - west) * LON_FACTOR * scale
const projectY = (latitude: number) => offsetY + (north - latitude) * scale
const longitudeAt = (x: number) => west + (x - offsetX) / (LON_FACTOR * scale)
const latitudeAt = (y: number) => north - (y - offsetY) / scale

function pathFor(geometry: Geometry) {
  return polygons(geometry).flatMap((polygon) => polygon.map((ring) =>
    ring.map(([longitude, latitude], index) =>
      `${index === 0 ? 'M' : 'L'}${projectX(longitude).toFixed(2)},${projectY(latitude).toFixed(2)}`,
    ).join(' ') + ' Z',
  )).join(' ')
}

function geometryCenter(geometry: Geometry) {
  const points = polygons(geometry).flat(2)
  const geometryWest = Math.min(...points.map(([longitude]) => longitude))
  const geometryEast = Math.max(...points.map(([longitude]) => longitude))
  const geometrySouth = Math.min(...points.map(([, latitude]) => latitude))
  const geometryNorth = Math.max(...points.map(([, latitude]) => latitude))
  return {
    x: projectX((geometryWest + geometryEast) / 2),
    y: projectY((geometrySouth + geometryNorth) / 2),
  }
}

const SHORT_REGION_NAMES: Record<string, string> = {
  Seoul: '서울', Busan: '부산', Daegu: '대구', Incheon: '인천', Gwangju: '광주',
  Daejeon: '대전', Ulsan: '울산', Sejong: '세종', Gyeonggi: '경기', Gangwon: '강원',
  'North Chungcheong': '충북', 'South Chungcheong': '충남',
  'North Jeolla': '전북', 'South Jeolla': '전남',
  'North Gyeongsang': '경북', 'South Gyeongsang': '경남', Jeju: '제주',
}

type View = { x: number; y: number; size: number }
type Point = { x: number; y: number }
type Drag = { mode: 'pan'; start: Point; view: View } | { mode: 'select'; start: Point }
type SelectionRect = { x: number; y: number; width: number; height: number }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function viewForRegion(region: RegionMap | null): View {
  if (!region) return { x: 0, y: 0, size: WORLD }
  const left = projectX(region.west)
  const right = projectX(region.east)
  const top = projectY(region.north)
  const bottom = projectY(region.south)
  const size = clamp(Math.max(right - left, bottom - top) * 1.55, WORLD / 8, WORLD)
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  return {
    x: clamp(centerX - size / 2, 0, WORLD - size),
    y: clamp(centerY - size / 2, 0, WORLD - size),
    size,
  }
}

export function KoreaMap({ active, selecting, selection, countryRegion, provinceRegions, focusRegion, mapRegions, onRegionClick, onAreaSelect }: {
  active: boolean
  selecting: boolean
  selection: MapSelection | null
  countryRegion: RegionMap | null
  provinceRegions: RegionMap[]
  focusRegion: RegionMap | null
  mapRegions: RegionMap[]
  onRegionClick: (region: RegionMap) => void
  onAreaSelect: (selection: MapSelection) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [view, setView] = useState<View>(() => viewForRegion(focusRegion))
  const [draftRect, setDraftRect] = useState<SelectionRect | null>(null)
  const provincePaths = provinceRegions.map((region) => ({
    region,
    path: pathFor(region.geometry),
    center: geometryCenter(region.geometry),
  }))
  const countryPath = countryRegion
    ? pathFor(countryRegion.geometry)
    : provincePaths.map((province) => province.path).join(' ')
  const clickableRegions = mapRegions.map((region) => ({
    region,
    path: pathFor(region.geometry),
    center: geometryCenter(region.geometry),
  }))
  const showChildLabels = mapRegions[0]?.level === 2
  const selectedRect = selection ? {
    x: projectX(selection.west), y: projectY(selection.north),
    width: projectX(selection.east) - projectX(selection.west),
    height: projectY(selection.south) - projectY(selection.north),
  } : null

  function rectBetween(start: Point, end: Point): SelectionRect {
    return {
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
    }
  }
  function pointAt(clientX: number, clientY: number, current = view): Point {
    const bounds = svg.current?.getBoundingClientRect()
    if (!bounds) return { x: WORLD / 2, y: WORLD / 2 }
    return {
      x: clamp(current.x + (clientX - bounds.left) / bounds.width * current.size, current.x, current.x + current.size),
      y: clamp(current.y + (clientY - bounds.top) / bounds.height * current.size, current.y, current.y + current.size),
    }
  }

  function zoom(factor: number, anchor: Point = {
    x: view.x + view.size / 2, y: view.y + view.size / 2,
  }) {
    setView((current) => {
      const size = clamp(current.size * factor, WORLD / 8, WORLD)
      const ratio = size / current.size
      return {
        x: clamp(anchor.x - (anchor.x - current.x) * ratio, 0, WORLD - size),
        y: clamp(anchor.y - (anchor.y - current.y) * ratio, 0, WORLD - size),
        size,
      }
    })
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    if (!active) return
    event.preventDefault()
    zoom(event.deltaY < 0 ? 0.82 : 1.22, pointAt(event.clientX, event.clientY))
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!active || event.button !== 0) return
    const start = pointAt(event.clientX, event.clientY)
    drag.current = selecting ? { mode: 'select', start } : { mode: 'pan', start, view }
    if (selecting) setDraftRect({ x: start.x, y: start.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = drag.current
    if (!currentDrag) return
    if (currentDrag.mode === 'select') {
      setDraftRect(rectBetween(currentDrag.start, pointAt(event.clientX, event.clientY)))
      return
    }
    const bounds = svg.current?.getBoundingClientRect()
    if (!bounds) return
    const dx = (event.clientX - bounds.left) / bounds.width * currentDrag.view.size
      - (currentDrag.start.x - currentDrag.view.x)
    const dy = (event.clientY - bounds.top) / bounds.height * currentDrag.view.size
      - (currentDrag.start.y - currentDrag.view.y)
    setView({
      ...currentDrag.view,
      x: clamp(currentDrag.view.x - dx, 0, WORLD - currentDrag.view.size),
      y: clamp(currentDrag.view.y - dy, 0, WORLD - currentDrag.view.size),
    })
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = drag.current
    if (currentDrag?.mode === 'select') {
      const rect = rectBetween(currentDrag.start, pointAt(event.clientX, event.clientY))
      if (rect.width >= 4 && rect.height >= 4) {
        onAreaSelect({
          west: longitudeAt(rect.x), south: latitudeAt(rect.y + rect.height),
          east: longitudeAt(rect.x + rect.width), north: latitudeAt(rect.y),
        })
      }
      setDraftRect(null)
    }
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onPointerCancel() {
    drag.current = null
    setDraftRect(null)
  }

  return (
    <div className={`korea-map${active ? ' is-active' : ''}${selecting ? ' is-selecting' : ''}`}>
      <svg ref={svg} className="korea-map-svg" viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
        role="img" aria-label="대한민국 지도"
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        <path className="korea-country-base" d={countryPath} fillRule="evenodd" />
        {provincePaths.map(({ region, path }) => <path key={`${region.id}-area`} className="korea-province-area" d={path} />)}
        <path className="korea-country-outline" d={countryPath} fill="none" />
        {provincePaths.map(({ region, path }) => <path key={region.id} className="korea-province" d={path} />)}
        {!selecting && clickableRegions.map(({ region, path }) => (
          <path key={`click-${region.id}`} className="korea-clickable-region" d={path}
            role="button" tabIndex={0} aria-label={`${region.name} 선택`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onRegionClick(region) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onRegionClick(region)
              }
            }}>
            <title>{region.name}</title>
          </path>
        ))}
        {provincePaths.map(({ region, center }) => (
          <text key={`${region.id}-label`} className="korea-region-label" x={center.x} y={center.y}
            style={{ fontSize: view.size * 0.014 }}>
            <title>{region.name}</title>{SHORT_REGION_NAMES[region.name] ?? region.name}
          </text>
        ))}
        {showChildLabels && clickableRegions.map(({ region, center }) => (
          <text key={`child-label-${region.id}`} className="korea-child-region-label"
            x={center.x} y={center.y} style={{ fontSize: view.size * 0.012 }}>
            {region.name}
          </text>
        ))}
        {(draftRect ?? selectedRect) && <rect className="korea-analysis-area"
          x={(draftRect ?? selectedRect)?.x} y={(draftRect ?? selectedRect)?.y}
          width={(draftRect ?? selectedRect)?.width} height={(draftRect ?? selectedRect)?.height} />}
      </svg>
      {active && <div className="korea-map-controls" aria-label="지도 확대 조작">
        <button type="button" aria-label="지도 확대" onClick={() => zoom(0.75)}>+</button>
        <button type="button" aria-label="지도 축소" onClick={() => zoom(1.33)}>−</button>
        <button type="button" aria-label="지도 원래 크기" onClick={() => setView({ x: 0, y: 0, size: WORLD })}>⌂</button>
      </div>}
    </div>
  )
}
