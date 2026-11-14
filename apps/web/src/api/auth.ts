export type CurrentUser = {
  id: number
  name: string
  email: string
}

export type PendingSignup = {
  registrationRequired: true
  name: string | null
  email: string
}

export type SignupDetails = {
  name: string
  nationalityCode: string
}

export const GOOGLE_LOGIN_URL = '/oauth2/authorization/google'

export class AuthRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Account request failed')
    this.status = status
  }
}

export async function getAccount(signal: AbortSignal): Promise<CurrentUser | PendingSignup | null> {
  const response = await fetch('/api/me', { signal })
  if (response.status === 401) return null
  if (!response.ok) throw new AuthRequestError(response.status)
  return response.json()
}

async function sendAccountRequest(path: string, body?: SignupDetails) {
  const response = await fetch('/api/csrf')
  if (!response.ok) throw new AuthRequestError(response.status)

  const csrf: { headerName: string; token: string } = await response.json()
  const headers = new Headers({ [csrf.headerName]: csrf.token })
  if (body) headers.set('Content-Type', 'application/json')

  return fetch(path, {
    method: 'POST',
    headers,
    body: body && JSON.stringify(body),
  })
}

export async function completeSignup(details: SignupDetails): Promise<CurrentUser> {
  const response = await sendAccountRequest('/api/signup', details)
  if (!response.ok) throw new AuthRequestError(response.status)
  return response.json()
}

export async function logout() {
  try {
    const response = await sendAccountRequest('/api/logout')
    if (!response.ok) throw new AuthRequestError(response.status)
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) return
    throw error
  }
}
