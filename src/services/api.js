// Centraliza las solicitudes del frontend; path es relativo a /api y options configura fetch.
export async function api(path, options = {}) {
  // Los objetos se serializan como JSON; los archivos se envían directamente como datos binarios.
  const isJson = options.body && !(options.body instanceof File)
  const response = await fetch(`/api${path}`, {
    ...options,
    // Incluye la cookie de sesión en las peticiones al mismo origen.
    credentials: 'same-origin',
    headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: isJson ? JSON.stringify(options.body) : options.body,
  })
  // Si la respuesta no contiene JSON válido, usa un objeto vacío para gestionar el error.
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    // Notifica a App cuando una operación requiere volver a iniciar sesión.
    if (response.status === 401 && !['/login', '/me'].includes(path)) window.dispatchEvent(new Event('session-expired'))
    throw new Error(data.error || 'No se pudo conectar con el servidor.')
  }
  return data
}
