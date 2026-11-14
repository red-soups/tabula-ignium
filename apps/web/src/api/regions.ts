export type RegionOption = {
  id: number
  name: string
  countryCode: string
  level: number | null
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
