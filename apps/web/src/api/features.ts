export type FeatureOption = {
  id: number
  code: string
  name: string
  description: string
}

export class FeatureRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Feature request failed')
    this.status = status
  }
}

export async function getFeatures(signal: AbortSignal): Promise<FeatureOption[]> {
  const response = await fetch('/api/features', { signal, cache: 'no-store' })
  if (!response.ok) throw new FeatureRequestError(response.status)
  return response.json()
}
