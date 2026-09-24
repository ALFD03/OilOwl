/**
 * Cliente HTTP único. El access token vive solo en memoria; el refresh token viaja en una
 * cookie httpOnly que el navegador envía a /api/auth/*. Si un request devuelve 401 se intenta
 * renovar una sola vez (con deduplicación) y se reintenta.
 */

export interface ApiErrorBody {
  code: string
  message: string
  details: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Error de comunicación con el servidor')
    this.status = status
    this.code = body.code ?? 'error'
    this.details = body.details ?? null
  }

  /** Errores de validación por campo: { campo: ["mensaje"] } */
  get fieldErrors(): Record<string, string[]> {
    if (this.details && typeof this.details === 'object' && !Array.isArray(this.details)) {
      return this.details as Record<string, string[]>
    }
    return {}
  }
}

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null
const listeners = new Set<(token: string | null) => void>()

export const tokenStore = {
  get: () => accessToken,
  set(token: string | null) {
    accessToken = token
    listeners.forEach((fn) => fn(token))
  },
  subscribe(fn: (token: string | null) => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

const CLIENT_HEADERS = { 'X-OilOwl-Client': 'web' }

async function parse(response: Response) {
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export async function refreshSession(): Promise<string | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: CLIENT_HEADERS })
    .then(async (response) => {
      if (!response.ok) return null
      const data = await parse(response)
      return (data?.access as string) ?? null
    })
    .catch(() => null)
    .then((token) => {
      tokenStore.set(token)
      return token
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type Query = Record<string, string | number | boolean | null | undefined>

export function buildUrl(path: string, query?: Query) {
  const url = new URL(path.startsWith('/api') ? path : `/api/${path.replace(/^\//, '')}`, window.location.origin)
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  return url.pathname + url.search
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  retry?: boolean
}

export async function api<T = unknown>(path: string, { method = 'GET', body, query, retry = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...CLIENT_HEADERS }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && retry && !path.includes('/auth/')) {
    const token = await refreshSession()
    if (token) return api<T>(path, { method, body, query, retry: false })
  }

  const data = await parse(response).catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? { message: response.statusText })
  }
  return data as T
}
