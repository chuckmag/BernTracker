const BASE_URL = import.meta.env.VITE_API_URL ?? ''

let _refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => (r.ok ? r.json().then((d) => d.accessToken as string) : null))
    .catch(() => null)
    .finally(() => { _refreshPromise = null })
  return _refreshPromise
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, ...init } = options
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
    }
  }

  return res
}
