import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import koreaMap from '../data/koreaMap.json'

type Geometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

type MapFeature = {
  properties: { name: string; level: number }
  geometry: Geometry
}

export type MapSelection = {
  west: number
  south: number
  east: number
  north: number
  rect: { x: number; y: number; width: number; height: number }
}

const features = (koreaMap as unknown as { features: MapFeature[] }).features
const country = features.find((feature) => feature.properties.level === 0)
const provinces = features.filter((feature) => feature.properties.level === 1)
const WORLD = 1000
const PADDING = 94
const LON_FACTOR = Math.cos(36 * Math.PI / 180)

function polygons(geometry: Geometry): number[][][][] {
  return geometry.type === 'MultiPolygon'
    ? geometry.coordinates as number[][][][]
    : [geometry.coordinates as number[][][]]
}

const coordinates = country ? polygons(country.geometry).flat(2) : []
const west = Math.min(...coordinates.map(([longitude]) => longitude))
const east = Math.max(...coordinates.map(([longitude]) => longitude))
const south = Math.min(...coordinates.map(([, latitude]) => latitude))
const north = Math.max(...coordinates.map(([, latitude]) => latitude))
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

const countryPath = country ? pathFor(country.geometry) : ''
const provincePaths = provinces.map((feature) => ({
  name: feature.properties.name,
  path: pathFor(feature.geometry),
}))
const TILE_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84'

type View = { x: number; y: number; size: number }
type Point = { x: number; y: number }
type Drag = { kind: 'pan'; start: Point; view: View } | { kind: 'select'; start: Point }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function rectangle(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function visibleTiles(view: View) {
  // The 2016 EOxCloudless WGS84 grid starts with two 180° tiles at level 0.
  const level = clamp(5 + Math.floor(Math.log2(WORLD / view.size)), 5, 8)
  const span = 180 / 2 ** level
  const minX = Math.floor((Math.max(west, longitudeAt(view.x)) + 180) / span)
  const maxX = Math.floor((Math.min(east, longitudeAt(view.x + view.size)) + 180) / span)
  const minY = Math.floor((90 - Math.min(north, latitudeAt(view.y))) / span)
  const maxY = Math.floor((90 - Math.max(south, latitudeAt(view.y + view.size))) / span)
  const tiles = []
  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      const tileWest = -180 + col * span
      const tileNorth = 90 - row * span
      tiles.push({
        key: `${level}-${row}-${col}`,
        href: `${TILE_URL}/${level}/${row}/${col}.jpg`,
        x: projectX(tileWest),
        y: projectY(tileNorth),
        width: span * LON_FACTOR * scale,
        height: span * scale,
      })
    }
  }
  return tiles
}

export function KoreaMap({ active, selecting, selection, onSelect }: {
  active: boolean
  selecting: boolean
  selection: MapSelection | null
  onSelect: (selection: MapSelection) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, size: WORLD })
  const [draft, setDraft] = useState<ReturnType<typeof rectangle> | null>(null)
  const tiles = visibleTiles(view)

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
    drag.current = selecting ? { kind: 'select', start } : { kind: 'pan', start, view }
    if (selecting) setDraft(rectangle(start, start))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = drag.current
    if (!currentDrag) return
    if (currentDrag.kind === 'select') {
      setDraft(rectangle(currentDrag.start, pointAt(event.clientX, event.clientY)))
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
    if (currentDrag?.kind === 'select') {
      const rect = rectangle(currentDrag.start, pointAt(event.clientX, event.clientY))
      if (rect.width >= view.size * 0.012 && rect.height >= view.size * 0.012) {
        onSelect({
          west: longitudeAt(rect.x),
          east: longitudeAt(rect.x + rect.width),
          north: latitudeAt(rect.y),
          south: latitudeAt(rect.y + rect.height),
          rect,
        })
      }
    }
    drag.current = null
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onPointerCancel() {
    drag.current = null
    setDraft(null)
  }

  return (
    <div className={`korea-map${active ? ' is-active' : ''}${selecting ? ' is-selecting' : ''}`}>
      <svg ref={svg} className="korea-map-svg" viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
        role="img" aria-label="대한민국 지도"
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        <defs><clipPath id="korea-country-clip"><path d={countryPath} clipRule="evenodd" /></clipPath></defs>
        <path className="korea-country-base" d={countryPath} fillRule="evenodd" />
        <g clipPath="url(#korea-country-clip)" className="korea-imagery">
          {tiles.map(({ key, ...tile }) => <image key={key} {...tile} preserveAspectRatio="none" />)}
        </g>
        <path className="korea-country-outline" d={countryPath} fill="none" />
        {provincePaths.map(({ name, path }) => <path key={name} className="korea-province" d={path} />)}
        {selection && <rect className="korea-selected-area" {...selection.rect} />}
        {draft && <rect className="korea-draft-area" {...draft} />}
      </svg>
      {active && <div className="korea-map-controls" aria-label="지도 확대 조작">
        <button type="button" aria-label="지도 확대" onClick={() => zoom(0.75)}>+</button>
        <button type="button" aria-label="지도 축소" onClick={() => zoom(1.33)}>−</button>
        <button type="button" aria-label="지도 원래 크기" onClick={() => setView({ x: 0, y: 0, size: WORLD })}>⌂</button>
      </div>}
    </div>
  )
}
