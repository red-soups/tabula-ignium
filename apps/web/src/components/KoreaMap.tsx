import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalysisBounds, FireHotspot, FirePoint } from '../api/fireData'
import type { RegionGeometry, RegionMap } from '../api/regions'
import type { HeatCell } from '../api/fireTimelapse'
import { localeFor } from '../i18n'

export type MapSelection = AnalysisBounds

type Point = { x: number; y: number }
type Size = { width: number; height: number }
type Rectangle = Point & Size
type View = { center: Point; size: number }
type Drag =
  | { mode: 'area'; pointerId: number; start: Point }
  | { mode: 'pan'; pointerId: number; start: Point; center: Point; size: number }
type Tile = Rectangle & { href: string; level: number; row: number; column: number }

const WORLD = 1000
const MIN_VIEW_SIZE = WORLD / 256
const TILE_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024/default/WGS84'
const BASE_TILE_LEVEL = 5
const MAX_TILE_LEVEL = 13
const TILE_PIXELS = 256
const TILE_REQUEST_DELAY_MS = 140
const MAX_CACHED_TILES = 160
const DRAG_THRESHOLD = 4
const NO_REGIONS: RegionMap[] = []
const FIRE_MONTH_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#facc15', '#f97316', '#e9011d']
const HEAT_FULL = 40  // detections per cell-year drawn at full size
const EMBER_GLOWS = ['#ff8a2a', '#ffb347', '#ffd166']  // weak → strong cells

function fireObservationMonths(toPeriod: string) {
  const [year, month] = toPeriod.split('-').map(Number)
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 6 + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

// Frame the country and its islands with space for the surrounding coast.
const west = 124.5
const east = 132
const south = 33
const north = 38.85
const longitudeFactor = Math.cos(36 * Math.PI / 180)
const longitudeSpan = (east - west) * longitudeFactor
const latitudeSpan = north - south
const scale = WORLD * 0.92 / Math.max(longitudeSpan, latitudeSpan)
const offsetX = (WORLD - longitudeSpan * scale) / 2
const offsetY = (WORLD - latitudeSpan * scale) / 2
const projectX = (longitude: number) => offsetX + (longitude - west) * longitudeFactor * scale
const projectY = (latitude: number) => offsetY + (north - latitude) * scale
const longitudeAt = (x: number) => west + (x - offsetX) / (longitudeFactor * scale)
const latitudeAt = (y: number) => north - (y - offsetY) / scale
const nationalView: View = { center: { x: WORLD / 2, y: WORLD / 2 }, size: WORLD }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function fitCenter(center: Point, size: number, aspect: Size): Point {
  const halfWidth = Math.min(WORLD, size * aspect.width) / 2
  const halfHeight = Math.min(WORLD, size * aspect.height) / 2
  return {
    x: clamp(center.x, halfWidth, WORLD - halfWidth),
    y: clamp(center.y, halfHeight, WORLD - halfHeight),
  }
}

function viewForBounds(bounds: AnalysisBounds | null, aspect: Size): View {
  if (!bounds) return nationalView
  const left = projectX(bounds.west)
  const right = projectX(bounds.east)
  const top = projectY(bounds.north)
  const bottom = projectY(bounds.south)
  const size = clamp(Math.max((right - left) / aspect.width, (bottom - top) / aspect.height) * 1.28, MIN_VIEW_SIZE, WORLD)
  return { center: { x: (left + right) / 2, y: (top + bottom) / 2 }, size }
}

function tileUrl(level: number, row: number, column: number) {
  return `${TILE_URL}/${level}/${row}/${column}.jpg`
}

function visibleTiles(viewport: Rectangle, level: number): Tile[] {
  // EOX's WGS84 grid starts with two 180° tiles at level 0.
  const span = 180 / 2 ** level
  const firstColumn = Math.floor((Math.max(-180, longitudeAt(viewport.x)) + 180) / span)
  const lastColumn = Math.ceil((Math.min(180, longitudeAt(viewport.x + viewport.width)) + 180) / span)
  const firstRow = Math.floor((90 - Math.min(90, latitudeAt(viewport.y))) / span)
  const lastRow = Math.ceil((90 - Math.max(-90, latitudeAt(viewport.y + viewport.height))) / span)
  const tiles: Tile[] = []

  for (let row = firstRow; row < lastRow; row++) {
    for (let column = firstColumn; column < lastColumn; column++) {
      tiles.push({
        href: tileUrl(level, row, column),
        level, row, column,
        x: projectX(-180 + column * span),
        y: projectY(90 - row * span),
        width: span * longitudeFactor * scale,
        height: span * scale,
      })
    }
  }

  return tiles
}

function useSatelliteTiles(viewport: Rectangle, level: number, ready: boolean) {
  const { x, y, width, height } = viewport
  const [requested, setRequested] = useState<Tile[]>([])
  const [loaded, setLoaded] = useState(() => new Map<string, Tile>())

  useEffect(() => {
    if (!ready || level === BASE_TILE_LEVEL) return
    const timeout = window.setTimeout(() => {
      setRequested(visibleTiles({ x, y, width, height }, level))
    }, TILE_REQUEST_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [x, y, width, height, level, ready])

  const tiles = new Map<string, Tile>()
  if (ready) {
    for (const tile of visibleTiles(viewport, BASE_TILE_LEVEL)) tiles.set(tile.href, tile)

    // Reuse the nearest loaded parent for each tile until its sharper image arrives.
    if (level > BASE_TILE_LEVEL) {
      for (const tile of visibleTiles(viewport, level)) {
        for (let parentLevel = level; parentLevel > BASE_TILE_LEVEL; parentLevel--) {
          const divisor = 2 ** (level - parentLevel)
          const href = tileUrl(parentLevel, Math.floor(tile.row / divisor), Math.floor(tile.column / divisor))
          const cached = loaded.get(href)
          if (!cached) continue
          tiles.set(href, cached)
          break
        }
      }

      for (const tile of requested) {
        if (tile.level <= level && tile.x < x + width && tile.x + tile.width > x &&
            tile.y < y + height && tile.y + tile.height > y) {
          tiles.set(tile.href, tile)
        }
      }
    }
  }

  function rememberTile(tile: Tile) {
    if (tile.level === BASE_TILE_LEVEL) return
    setLoaded((previous) => {
      if (previous.has(tile.href)) return previous
      const next = new Map(previous)
      if (next.size >= MAX_CACHED_TILES) {
        const oldest = next.keys().next().value
        if (oldest) next.delete(oldest)
      }
      next.set(tile.href, tile)
      return next
    })
  }

  return { tiles: [...tiles.values()].sort((a, b) => a.level - b.level), rememberTile }
}

function pathFor(geometry: RegionGeometry) {
  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates as number[][][][]
    : [geometry.coordinates as number[][][]]
  return polygons.flatMap((polygon) => polygon.map((ring) =>
    ring.map(([longitude, latitude], index) =>
      `${index === 0 ? 'M' : 'L'}${projectX(longitude).toFixed(3)},${projectY(latitude).toFixed(3)}`,
    ).join(' ') + ' Z',
  )).join(' ')
}

function rectBetween(start: Point, end: Point): Rectangle {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function SatelliteMapAttribution() {
  return <div className="workspace-map-attribution">
    <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOxCloudless</a>
    {' by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024) · '}
    <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>
  </div>
}

export function KoreaMap({
  active, selecting = false, selection = null, focusBounds = null,
  mapRegions = NO_REGIONS, observations, observationPeriod, heat, hotspots, hotspotGridMeters,
  onRegionClick, onAreaSelect,
}: {
  active: boolean
  heat?: HeatCell[]
  selecting?: boolean
  selection?: MapSelection | null
  focusBounds?: AnalysisBounds | null
  mapRegions?: RegionMap[]
  observations?: FirePoint[]
  observationPeriod?: string
  hotspots?: FireHotspot[]
  hotspotGridMeters?: number
  onRegionClick?: (region: RegionMap) => void
  onAreaSelect?: (selection: MapSelection) => void
}) {
  const { t, i18n } = useTranslation()
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const didPan = useRef(false)
  const [screen, setScreen] = useState<Size | null>(null)
  const [manualView, setManualView] = useState<View | null>(null)
  const [draftRect, setDraftRect] = useState<Rectangle | null>(null)
  const shortSide = screen ? Math.min(screen.width, screen.height) : 0
  const aspect = screen && shortSide > 0
    ? { width: screen.width / shortSide, height: screen.height / shortSide }
    : { width: 1, height: 1 }
  const focusedView = viewForBounds(focusBounds, aspect)
  const view = manualView ?? focusedView
  const center = fitCenter(view.center, view.size, aspect)
  const width = view.size * aspect.width
  const height = view.size * aspect.height
  const viewport = { x: center.x - width / 2, y: center.y - height / 2, width, height }
  const pixelsPerLevelZeroTile = 180 * scale * shortSide / view.size
  const level = clamp(Math.ceil(Math.log2(pixelsPerLevelZeroTile / TILE_PIXELS)), BASE_TILE_LEVEL, MAX_TILE_LEVEL)
  const { tiles, rememberTile } = useSatelliteTiles(viewport, level, screen !== null)
  const regionPaths = useMemo(() => mapRegions.map((region) => ({
    region, path: pathFor(region.geometry),
  })), [mapRegions])
  const observationMonths = useMemo(() => observationPeriod ? fireObservationMonths(observationPeriod) : [], [observationPeriod])
  const observationColors = useMemo(() => new Map(observationMonths.map((period, index) =>
    [period, FIRE_MONTH_COLORS[index]])), [observationMonths])
  const observationMarkers = useMemo(() => {
    if (!observations?.length) return []
    const maximumFrp = Math.max(1, ...observations.map((point) => point.frp))
    return observations.map((point) => ({
      id: point.id,
      x: projectX(point.longitude),
      y: projectY(point.latitude),
      radius: 2.2 + Math.sqrt(Math.max(0, point.frp) / maximumFrp) * 7,
      color: observationColors.get(point.period) ?? FIRE_MONTH_COLORS[5],
      label: `${point.period} · ${point.sensor} · FRP ${point.frp.toFixed(2)} · ${point.confidenceLevel}`,
    }))
  }, [observationColors, observations])
  const hotspotCells = useMemo(() => {
    if (!hotspots?.length || !hotspotGridMeters) return []
    const maximumCount = Math.max(1, ...hotspots.map((hotspot) => hotspot.observationCount))
    return hotspots.map((hotspot) => {
      const halfLatitude = hotspotGridMeters / 2 / 111_320
      const halfLongitude = hotspotGridMeters / 2
        / (111_320 * Math.cos(hotspot.centerLatitude * Math.PI / 180))
      const left = projectX(hotspot.centerLongitude - halfLongitude)
      const right = projectX(hotspot.centerLongitude + halfLongitude)
      const top = projectY(hotspot.centerLatitude + halfLatitude)
      const bottom = projectY(hotspot.centerLatitude - halfLatitude)
      const intensity = hotspot.observationCount / maximumCount
      return {
        ...hotspot,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        opacity: 0.28 + intensity * 0.62,
      }
    })
  }, [hotspotGridMeters, hotspots])
  const visibleSelection = draftRect ?? (selection && rectBetween(
    { x: projectX(selection.west), y: projectY(selection.north) },
    { x: projectX(selection.east), y: projectY(selection.south) },
  ))

  useEffect(() => {
    const element = svg.current
    if (!element) return
    const observer = new ResizeObserver(([{ contentRect: { width, height } }]) => {
      if (width > 0 && height > 0) setScreen({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function pointAt(clientX: number, clientY: number, bounds: DOMRect): Point {
    return {
      x: viewport.x + (clientX - bounds.left) / bounds.width * viewport.width,
      y: viewport.y + (clientY - bounds.top) / bounds.height * viewport.height,
    }
  }

  function areaPoint(clientX: number, clientY: number, bounds: DOMRect) {
    const point = pointAt(
      clamp(clientX, bounds.left, bounds.right),
      clamp(clientY, bounds.top, bounds.bottom),
      bounds,
    )
    return { x: clamp(point.x, 0, WORLD), y: clamp(point.y, 0, WORLD) }
  }

  function zoom(factor: number, anchor = center) {
    setManualView((manual) => {
      const current = manual ?? view
      const size = clamp(current.size * factor, MIN_VIEW_SIZE, WORLD)
      if (size === WORLD) return nationalView
      const ratio = size / current.size
      const currentCenter = fitCenter(current.center, current.size, aspect)
      return {
        center: fitCenter({
          x: anchor.x + (currentCenter.x - anchor.x) * ratio,
          y: anchor.y + (currentCenter.y - anchor.y) * ratio,
        }, size, aspect),
        size,
      }
    })
  }

  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (event.deltaY === 0 || drag.current?.mode === 'area') return
    const bounds = svg.current?.getBoundingClientRect()
    if (!bounds) return
    event.preventDefault()
    zoom(event.deltaY < 0 ? 0.82 : 1 / 0.82, pointAt(event.clientX, event.clientY, bounds))
  })

  useEffect(() => {
    if (!active) return
    const element = svg.current
    if (!element) return
    const listener = (event: WheelEvent) => onWheel(event)
    element.addEventListener('wheel', listener, { passive: false })
    return () => element.removeEventListener('wheel', listener)
  }, [active])

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!active || !event.isPrimary || event.button !== 0) return
    didPan.current = false
    const pointerId = event.pointerId
    if (selecting) {
      const start = areaPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
      drag.current = { mode: 'area', pointerId, start }
      event.currentTarget.setPointerCapture(pointerId)
      setDraftRect(rectBetween(start, start))
      return
    }
    drag.current = { mode: 'pan', pointerId, start: { x: event.clientX, y: event.clientY }, center, size: view.size }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (current.mode === 'area') {
      setDraftRect(rectBetween(current.start, areaPoint(event.clientX, event.clientY, bounds)))
      return
    }

    const dx = event.clientX - current.start.x
    const dy = event.clientY - current.start.y
    if (!didPan.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      didPan.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    setManualView({
      center: fitCenter({
        x: current.center.x - dx / bounds.width * current.size * aspect.width,
        y: current.center.y - dy / bounds.height * current.size * aspect.height,
      }, current.size, aspect),
      size: current.size,
    })
  }

  function onPointerEnd(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (current.mode !== 'area') return

    setDraftRect(null)
    if (event.type !== 'pointerup') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const rect = rectBetween(current.start, areaPoint(event.clientX, event.clientY, bounds))
    if (rect.width * bounds.width / viewport.width >= DRAG_THRESHOLD &&
        rect.height * bounds.height / viewport.height >= DRAG_THRESHOLD) {
      onAreaSelect?.({
        west: longitudeAt(rect.x), south: latitudeAt(rect.y + rect.height),
        east: longitudeAt(rect.x + rect.width), north: latitudeAt(rect.y),
      })
    }
  }

  return (
    <div className={`korea-map${active ? ' is-active' : ''}${selecting ? ' is-selecting' : ''}${heat ? ' is-night' : ''}`}>
      <svg ref={svg} className="korea-map-svg" viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        role="img" aria-label={hotspots ? t('map.hotspots') : observations ? t('map.observations') : t('map.korea')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <g className="korea-imagery" aria-hidden="true">
          {tiles.map((tile) => (
            <image key={tile.href} href={tile.href} crossOrigin="anonymous" x={tile.x} y={tile.y}
              width={tile.width} height={tile.height} preserveAspectRatio="none"
              onLoad={() => rememberTile(tile)} />
          ))}
        </g>
        {active && !selecting && regionPaths.map(({ region, path }) => (
          <path key={region.id} className="korea-clickable-region" d={path} fillRule="evenodd" aria-hidden="true"
            onClick={() => { if (!didPan.current) onRegionClick?.(region) }} />
        ))}
        {heat && <defs>
          {/* Ember: white-hot core, orange-to-gold glow fading out (same look as the old globe's hotspots). */}
          {EMBER_GLOWS.map((glow, tier) => <radialGradient key={tier} id={`korea-ember-${tier}`}>
            <stop offset="0" stopColor="#fff6dc" />
            <stop offset="0.16" stopColor={glow} stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#ff5a14" stopOpacity="0.42" />
            <stop offset="1" stopColor="#ff4710" stopOpacity="0" />
          </radialGradient>)}
        </defs>}
        {shortSide > 0 && heat?.map((cell) => {
          const strength = Math.sqrt(Math.min(cell.value, HEAT_FULL) / HEAT_FULL)
          const tier = strength > 0.6 ? 2 : strength > 0.3 ? 1 : 0
          const flicker = 1.1 + (Math.abs(cell.latitude * 37 + cell.longitude * 53) % 1) * 0.9
          return <circle key={cell.key} className="korea-ember" cx={projectX(cell.longitude)} cy={projectY(cell.latitude)}
            r={(3 + strength * 10) * view.size / shortSide} fill={`url(#korea-ember-${tier})`}
            style={{ '--flicker': `${flicker.toFixed(2)}s` } as CSSProperties} />
        })}
        {visibleSelection && <rect className="korea-analysis-area" {...visibleSelection} />}
        {hotspotCells.map((cell) => {
          const labelScale = shortSide > 0 ? view.size / shortSide : 1
          const centerX = cell.x + cell.width / 2
          const centerY = cell.y + cell.height / 2
          return <g key={cell.hotspotRank} className="korea-hotspot-group">
            <rect className="korea-hotspot-cell"
              x={cell.x} y={cell.y} width={cell.width} height={cell.height}
              style={{ fillOpacity: cell.opacity }}>
              <title>#{cell.hotspotRank} · {t('common.observations', { count: cell.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })} · {t('fire.labels.averageFrp')} {cell.averageFrp.toFixed(1)} MW</title>
            </rect>
            <text className="korea-hotspot-rank" x={centerX} y={centerY - 2 * labelScale}
              style={{ fontSize: 11 * labelScale }}>#{cell.hotspotRank}</text>
            <text className="korea-hotspot-count" x={centerX} y={centerY + 9 * labelScale}
              style={{ fontSize: 8 * labelScale }}>{t('common.observations', { count: cell.observationCount.toLocaleString(localeFor(i18n.resolvedLanguage)) })}</text>
          </g>
        })}
        {shortSide > 0 && observationMarkers.map((marker) => (
          <circle key={marker.id} className="korea-fire-marker" cx={marker.x} cy={marker.y}
            r={marker.radius * view.size / shortSide} style={{ fill: marker.color }}>
            <title>{marker.label}</title>
          </circle>
        ))}
      </svg>
      {observations && observationMonths.length > 0 && <div className="korea-fire-month-legend" aria-label={t('map.monthLegend')}>
        {observationMonths.map((period, index) => <span key={period}>
          <i style={{ backgroundColor: FIRE_MONTH_COLORS[index] }} />{period.replace('-', '.')}
        </span>)}
      </div>}
      {hotspots && hotspots.length > 0 && <div className="korea-hotspot-legend" aria-label={t('map.hotspotLegend')}>
        <strong>{t('map.concentration')}</strong><span>{t('map.low')}</span><i /><span>{t('map.high')}</span>
      </div>}
      {active && <div className="korea-map-controls" aria-label={t('map.controls')}>
        <button type="button" aria-label={t('map.zoomIn')} disabled={view.size <= MIN_VIEW_SIZE} onClick={() => zoom(0.75)}>+</button>
        <button type="button" aria-label={t('map.zoomOut')} disabled={view.size >= WORLD} onClick={() => zoom(1 / 0.75)}>−</button>
        <button type="button" aria-label={observations ? t('map.returnArea') : t('map.reset')}
          onClick={() => setManualView(observations ? focusedView : nationalView)}>⌂</button>
      </div>}
    </div>
  )
}
