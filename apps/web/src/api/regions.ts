export type RegionOption = {
  id: number
  name: string
  countryCode: string
  level: number | null
}

export type RegionGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export type RegionMap = {
  id: number
  parentId: number | null
  name: string
  level: number
  west: number
  east: number
  south: number
  north: number
  geometry: RegionGeometry
}

export class RegionRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Region request failed')
    this.status = status
  }
}

export async function getRegions(
  parentId: number | null,
  signal: AbortSignal,
): Promise<RegionOption[]> {
  const params = new URLSearchParams()
  if (parentId !== null) params.set('parentId', String(parentId))
  const query = params.size > 0 ? `?${params}` : ''

  const response = await fetch(`/api/regions${query}`, { signal })
  if (!response.ok) throw new RegionRequestError(response.status)
  return response.json()
}

type RegionMapResponse = Omit<RegionMap, 'geometry'> & {
  geometryGeoJson: string
}

function parseRegionMap(data: RegionMapResponse): RegionMap {
  return {
    id: data.id,
    parentId: data.parentId,
    name: data.name,
    level: data.level,
    west: data.west,
    east: data.east,
    south: data.south,
    north: data.north,
    geometry: JSON.parse(data.geometryGeoJson) as RegionGeometry,
  }
}

export async function getRegionMap(
  regionId: number,
  signal: AbortSignal,
): Promise<RegionMap> {
  const response = await fetch(`/api/regions/${regionId}/map`, { signal })
  if (!response.ok) throw new RegionRequestError(response.status)
  const data: RegionMapResponse = await response.json()
  return parseRegionMap(data)
}

export async function getChildRegionMaps(
  parentId: number,
  signal: AbortSignal,
): Promise<RegionMap[]> {
  const response = await fetch(`/api/regions/${parentId}/children/map`, { signal })
  if (!response.ok) throw new RegionRequestError(response.status)
  const data: RegionMapResponse[] = await response.json()
  return data.map(parseRegionMap)
}
