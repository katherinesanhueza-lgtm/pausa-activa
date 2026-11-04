export async function api(path, options = {}) {
  const isJson = options.body && !(options.body instanceof File)
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: isJson ? JSON.stringify(options.body) : options.body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !['/login', '/me'].includes(path)) window.dispatchEvent(new Event('session-expired'))
    throw new Error(data.error || 'No se pudo conectar con el servidor.')
  }
  return data
}
