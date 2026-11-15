export type RegionOption = {
  id: number
  name: string
  nameKo: string
  nameEn: string
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
  nameKo: string
  nameEn: string
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
  language: string,
): Promise<RegionOption[]> {
  const params = new URLSearchParams()
  if (parentId !== null) params.set('parentId', String(parentId))
  const query = params.size > 0 ? `?${params}` : ''

  const response = await fetch(`/api/regions${query}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new RegionRequestError(response.status)
  const data = await response.json() as Array<Omit<RegionOption, 'name' | 'nameKo' | 'nameEn'> & {
    name?: string
    nameKo?: string
    nameEn?: string
  }>
  return data.map((region) => ({
    ...region,
    nameKo: region.nameKo ?? region.name ?? '',
    nameEn: region.nameEn ?? region.name ?? '',
    name: language === 'en'
      ? region.nameEn ?? region.name ?? ''
      : region.nameKo ?? region.name ?? '',
  }))
}

type RegionMapResponse = Omit<RegionMap, 'geometry' | 'name' | 'nameKo' | 'nameEn'> & {
  name?: string
  nameKo?: string
  nameEn?: string
  geometryGeoJson: string
}

function parseRegionMap(data: RegionMapResponse, language: string): RegionMap {
  return {
    id: data.id,
    parentId: data.parentId,
    name: language === 'en'
      ? data.nameEn ?? data.name ?? ''
      : data.nameKo ?? data.name ?? '',
    nameKo: data.nameKo ?? data.name ?? '',
    nameEn: data.nameEn ?? data.name ?? '',
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
  language: string,
): Promise<RegionMap> {
  const response = await fetch(`/api/regions/${regionId}/map`, { signal, cache: 'no-store' })
  if (!response.ok) throw new RegionRequestError(response.status)
  const data: RegionMapResponse = await response.json()
  return parseRegionMap(data, language)
}

export async function getChildRegionMaps(
  parentId: number,
  signal: AbortSignal,
  language: string,
): Promise<RegionMap[]> {
  const response = await fetch(`/api/regions/${parentId}/children/map`, { signal, cache: 'no-store' })
  if (!response.ok) throw new RegionRequestError(response.status)
  const data: RegionMapResponse[] = await response.json()
  return data.map((region) => parseRegionMap(region, language))
}
