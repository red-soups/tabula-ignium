import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import earthDayUrl from '../assets/earth-day.jpg'
import { getProjectMap, type ProjectMapResponse } from '../api/projects'

type Region = ProjectMapResponse['regions'][number]
type Bounds = Pick<Region, 'west' | 'east' | 'south' | 'north'>
type Polygon = number[][][]

function projectBounds(regions: Region[]): Bounds | null {
  const usable = regions.filter((region) =>
    [region.west, region.east, region.south, region.north].every(Number.isFinite)
    && region.west <= region.east && region.south <= region.north)
  if (usable.length === 0) return null
  return {
    west: Math.min(...usable.map((region) => region.west)),
    east: Math.max(...usable.map((region) => region.east)),
    south: Math.min(...usable.map((region) => region.south)),
    north: Math.max(...usable.map((region) => region.north)),
  }
}

function mapViewport(bounds: Bounds, width: number, height: number) {
  const aspect = Math.max(1, width / height)
  const maxLatSpan = Math.min(180, 360 / aspect)
  const latSpan = Math.min(maxLatSpan, Math.max(
    (bounds.north - bounds.south) * 1.3,
    (bounds.east - bounds.west) * 1.3 / aspect,
    0.08,
  ))
  const lonSpan = latSpan * aspect
  const centerLat = (bounds.south + bounds.north) / 2
  const centerLon = (bounds.west + bounds.east) / 2
  const south = Math.max(-90, Math.min(90 - latSpan, centerLat - latSpan / 2))
  const west = Math.max(-180, Math.min(180 - lonSpan, centerLon - lonSpan / 2))
  return { west, north: south + latSpan, lonSpan, latSpan, width, height }
}

function regionPath(region: Region, viewport: ReturnType<typeof mapViewport>) {
  try {
    const geometry = JSON.parse(region.geometryGeoJson) as {
      type: 'Polygon' | 'MultiPolygon'
      coordinates: Polygon | Polygon[]
    }
    const polygons = geometry.type === 'Polygon'
      ? [geometry.coordinates as Polygon]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates as Polygon[] : []
    return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([longitude, latitude], index) => {
      const x = (longitude - viewport.west) / viewport.lonSpan * viewport.width
      const y = (viewport.north - latitude) / viewport.latSpan * viewport.height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ') + ' Z')).join(' ')
  } catch {
    return ''
  }
}

export function ProjectMapThumbnail({ projectId, regionNames }: {
  projectId: number
  regionNames: string[]
}) {
  const container = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState({ width: 300, height: 132 })
  const map = useQuery({
    queryKey: ['project-map', projectId],
    queryFn: ({ signal }) => getProjectMap(projectId, signal),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      setSize((previous) => previous.width === width && previous.height === height
        ? previous : { width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const bounds = useMemo(() => projectBounds(map.data?.regions ?? []), [map.data])
  const viewport = useMemo(() => bounds ? mapViewport(bounds, size.width, size.height) : null,
    [bounds, size.width, size.height])
  const showEarthImage = viewport !== null && viewport.lonSpan >= 6 && viewport.latSpan >= 3
  const paths = useMemo(() => viewport
    ? (map.data?.regions ?? []).map((region) => ({ id: region.id, path: regionPath(region, viewport) }))
    : [], [map.data, viewport])

  useEffect(() => {
    const element = canvas.current
    if (!element || !viewport || !showEarthImage) return
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    element.width = Math.round(viewport.width * pixelRatio)
    element.height = Math.round(viewport.height * pixelRatio)
    const context = element.getContext('2d')
    if (!context) return
    context.scale(pixelRatio, pixelRatio)
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      context.drawImage(image,
        (viewport.west + 180) / 360 * image.width,
        (90 - viewport.north) / 180 * image.height,
        viewport.lonSpan / 360 * image.width,
        viewport.latSpan / 180 * image.height,
        0, 0, viewport.width, viewport.height)
    }
    image.src = earthDayUrl
    return () => { active = false }
  }, [viewport, showEarthImage])

  return (
    <span className="project-preview" ref={container} aria-hidden="true">
      {viewport && (showEarthImage
        ? <canvas className="project-map-image" ref={canvas} />
        : <span className="project-map-local-grid" />)}
      {viewport && <svg className="project-map-regions" viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none">
        {paths.map(({ id, path }) => <path key={id} d={path} />)}
      </svg>}
      {!viewport && <span className="project-map-placeholder">{map.isError ? '지역 지도를 불러오지 못했습니다' : '지역 지도를 불러오는 중입니다'}</span>}
      <span className="project-area-tag">{regionNames.join(' · ')}</span>
    </span>
  )
}
