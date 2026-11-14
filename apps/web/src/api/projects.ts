export type ProjectResponse = {
  id: number
  name: string
  description: string | null
  regions: Array<{ id: number; name: string }>
  features: Array<{ id: number; name: string }>
  updatedAt: string
}

export type ProjectMapResponse = {
  projectId: number
  regions: Array<{
    id: number
    name: string
    level: number
    west: number
    east: number
    south: number
    north: number
    geometryGeoJson: string
  }>
}

export type CreateProjectDetails = {
  name: string
  description: string
  regionIds: number[]
  featureIds: number[]
}

export class ProjectRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Project request failed')
    this.status = status
  }
}

export async function getProjects(signal: AbortSignal): Promise<ProjectResponse[]> {
  const response = await fetch('/api/projects', { signal })
  if (!response.ok) throw new ProjectRequestError(response.status)
  return response.json()
}

export async function getProject(projectId: number, signal: AbortSignal): Promise<ProjectResponse> {
  const response = await fetch(`/api/projects/${projectId}`, { signal })
  if (!response.ok) throw new ProjectRequestError(response.status)
  return response.json()
}

export async function getProjectMap(projectId: number, signal: AbortSignal): Promise<ProjectMapResponse> {
  const response = await fetch(`/api/projects/${projectId}/map`, { signal })
  if (!response.ok) throw new ProjectRequestError(response.status)
  return response.json()
}

export async function createProject(details: CreateProjectDetails): Promise<ProjectResponse> {
  return sendProject('/api/projects', 'POST', details)
}

export async function updateProject(projectId: number, details: CreateProjectDetails): Promise<ProjectResponse> {
  return sendProject(`/api/projects/${projectId}`, 'PUT', details)
}

export async function deleteProject(projectId: number): Promise<void> {
  const csrfResponse = await fetch('/api/csrf')
  if (!csrfResponse.ok) throw new ProjectRequestError(csrfResponse.status)

  const csrf: { headerName: string; token: string } = await csrfResponse.json()
  const response = await fetch(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { [csrf.headerName]: csrf.token },
  })
  if (!response.ok) throw new ProjectRequestError(response.status)
}

async function sendProject(path: string, method: 'POST' | 'PUT', details: CreateProjectDetails) {
  const csrfResponse = await fetch('/api/csrf')
  if (!csrfResponse.ok) throw new ProjectRequestError(csrfResponse.status)

  const csrf: { headerName: string; token: string } = await csrfResponse.json()
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(details),
  })
  if (!response.ok) throw new ProjectRequestError(response.status)
  return response.json()
}
