import type { AnalysisBounds } from './fireData'

export type DocumentExportHistory = {
  id: number
  documentId: number
  documentName: string
  creatorName: string
  storageProvider: string
  filePath: string
  originalFileName: string
  fileSize: number
  accessHash: string
  createdAt: string
}

export type PublicDocumentExport = Pick<DocumentExportHistory,
  'accessHash' | 'documentName' | 'originalFileName' | 'fileSize' | 'createdAt'>

export type CreateDocumentExport = {
  documentName: string
  bounds: AnalysisBounds
  featureIds: number[]
  configurations: string[]
  file: Blob
}

export class DocumentExportError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Document export request failed')
    this.status = status
  }
}

async function csrfHeaders() {
  const response = await fetch('/api/csrf')
  if (!response.ok) throw new DocumentExportError(response.status)
  const csrf: { headerName: string; token: string } = await response.json()
  return new Headers({ [csrf.headerName]: csrf.token })
}

export async function createDocumentExport(request: CreateDocumentExport) {
  const form = new FormData()
  form.set('documentName', request.documentName)
  Object.entries(request.bounds).forEach(([key, value]) => form.set(key, String(value)))
  request.featureIds.forEach((id) => form.append('featureIds', String(id)))
  request.configurations.forEach((configuration) => form.append('configurations', configuration))
  form.set('file', request.file, `${request.documentName}.pdf`)
  const response = await fetch('/api/document-exports', { method: 'POST', headers: await csrfHeaders(), body: form })
  if (!response.ok) throw new DocumentExportError(response.status)
  return response.json() as Promise<DocumentExportHistory>
}

export async function getDocumentExports(signal: AbortSignal) {
  const response = await fetch('/api/document-exports', { signal, cache: 'no-store' })
  if (!response.ok) throw new DocumentExportError(response.status)
  return response.json() as Promise<DocumentExportHistory[]>
}

export async function deleteDocumentExport(id: number) {
  const response = await fetch(`/api/document-exports/${id}`, { method: 'DELETE', headers: await csrfHeaders() })
  if (!response.ok) throw new DocumentExportError(response.status)
}

export async function downloadDocumentExport(id: number, fileName: string) {
  const response = await fetch(`/api/document-exports/${id}/file`)
  if (!response.ok) throw new DocumentExportError(response.status)
  downloadBlob(await response.blob(), fileName)
}

export async function findPublicDocumentExport(accessHash: string) {
  const response = await fetch(`/api/document-exports/public/${encodeURIComponent(accessHash)}`, { cache: 'no-store' })
  if (!response.ok) throw new DocumentExportError(response.status)
  return response.json() as Promise<PublicDocumentExport>
}

export async function downloadPublicDocumentExport(accessHash: string, fileName: string) {
  const response = await fetch(`/api/document-exports/public/${encodeURIComponent(accessHash)}/file`)
  if (!response.ok) throw new DocumentExportError(response.status)
  downloadBlob(await response.blob(), fileName)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
