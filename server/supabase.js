// Integración ejecutada solo en el servidor: las claves privadas se leen del entorno.
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

// Comprueba si el backend tiene la URL y la clave de servicio necesarias para acceder a datos remotos.
export function supabaseConfigured() {
  return Boolean(url && serviceKey)
}

// Comprueba si está disponible la clave pública necesaria para autenticar usuarios.
export function supabaseAuthConfigured() {
  return Boolean(url && publishableKey)
}

// Realiza solicitudes a la API REST con la clave de servicio, tiempo límite y errores normalizados.
export async function supabaseRequest(resource, options = {}) {
  if (!supabaseConfigured()) {
    throw Object.assign(new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.'), { status: 503 })
  }

  let endpoint
  try {
    endpoint = new URL(`/rest/v1/${resource}`, url)
  } catch {
    throw Object.assign(new Error('SUPABASE_URL no es válida.'), { status: 503 })
  }

  let response
  try {
    response = await fetch(endpoint, {
      ...options,
      headers: {
        apikey: serviceKey,
        ...(!serviceKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${serviceKey}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(10000),
    })
  } catch (error) {
    throw Object.assign(new Error(`No se pudo conectar con Supabase: ${error.message}`), { status: 502 })
  }

  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.message || data.details || data.hint : data
    throw Object.assign(new Error(message || `Supabase respondió HTTP ${response.status}.`), {
      status: response.status === 409 ? 409 : 502,
      code: data?.code,
    })
  }
  return data
}

// Consulta el catálogo de colegios ordenado por nombre.
export async function listSupabaseSchools() {
  return await supabaseRequest('schools?select=id,name&order=name.asc') || []
}

// Inserta un colegio y solicita que la API devuelva el registro creado.
export async function createSupabaseSchool(name) {
  const result = await supabaseRequest('schools?select=id,name', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name }),
  })
  return result?.[0]
}

// Realiza operaciones administrativas de autenticación usando la clave privada del servidor.
async function supabaseAuthRequest(resource, options = {}) {
  if (!supabaseConfigured()) {
    throw Object.assign(new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.'), { status: 503 })
  }
  const endpoint = new URL(`/auth/v1/${resource}`, url)
  let response
  try {
    response = await fetch(endpoint, {
      ...options,
      headers: {
        apikey: serviceKey,
        ...(!serviceKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${serviceKey}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(10000),
    })
  } catch (error) {
    throw Object.assign(new Error(`No se pudo conectar con Supabase Auth: ${error.message}`), { status: 502 })
  }
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.msg || data.message || data.error_description || data.error : data
    throw Object.assign(new Error(message || `Supabase Auth respondió HTTP ${response.status}.`), {
      status: response.status === 422 ? 409 : 502,
      code: data?.code,
    })
  }
  return data
}

// Intercambia correo y contraseña por una sesión mediante la clave pública.
export async function signInSupabaseAccount(email, password) {
  if (!url || !publishableKey) {
    throw Object.assign(new Error('Configura SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY) en .env.'), { status: 503 })
  }
  const endpoint = new URL('/auth/v1/token?grant_type=password', url)
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    throw Object.assign(new Error(`No se pudo conectar con Supabase Auth: ${error.message}`), { status: 502 })
  }
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.msg || data.message || data.error_description || data.error : data
    throw Object.assign(new Error(message || 'No se pudo validar la cuenta en Supabase Auth.'), {
      status: [400, 401].includes(response.status) ? 401 : response.status === 429 ? 429 : 502,
    })
  }
  return data
}

// Ejecuta operaciones de sesión de usuario y traduce los errores de autenticación a estados HTTP.
async function supabaseUserRequest(resource, { accessToken, method = 'GET', body } = {}) {
  if (!url || !publishableKey) {
    throw Object.assign(new Error('Configura SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY) en .env.'), { status: 503 })
  }
  const endpoint = new URL(`/auth/v1/${resource}`, url)
  let response
  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        apikey: publishableKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    throw Object.assign(new Error(`No se pudo conectar con Supabase Auth: ${error.message}`), { status: 502 })
  }
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.msg || data.message || data.error_description || data.error : data
    throw Object.assign(new Error(message || `Supabase Auth respondió HTTP ${response.status}.`), {
      status: [400, 401].includes(response.status) ? 401 : response.status === 429 ? 429 : 502,
    })
  }
  return data
}

// Obtiene la identidad asociada a un token de acceso vigente.
export function getSupabaseAuthUser(accessToken) {
  return supabaseUserRequest('user', { accessToken })
}

// Solicita nuevos tokens usando el token de renovación.
export function refreshSupabaseSession(refreshToken) {
  return supabaseUserRequest('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } })
}

// Revoca la sesión remota actual con alcance local.
export function revokeSupabaseSession(accessToken) {
  return supabaseUserRequest('logout?scope=local', { method: 'POST', accessToken })
}

// Reutiliza o crea la cuenta remota y guarda su perfil asociado al colegio correspondiente.
export async function registerSupabaseAccount({ email, password, name, role, school }) {
  if (!supabaseAuthConfigured()) {
    throw Object.assign(new Error('Configura SUPABASE_PUBLISHABLE_KEY (o SUPABASE_ANON_KEY) en .env antes de gestionar cuentas.'), { status: 503 })
  }
  const existing = await supabaseAuthRequest('admin/users?page=1&per_page=1000')
  const match = existing?.users?.find(user => user.email?.toLowerCase() === email.toLowerCase())
  const authUser = match || await supabaseAuthRequest('admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const schoolMatch = school
    ? (await listSupabaseSchools()).find(item => item.name.toLocaleLowerCase('es') === school.toLocaleLowerCase('es'))
    : null
  try {
    await supabaseRequest('profiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: authUser.id,
        name,
        email,
        role,
        school_id: schoolMatch?.id || null,
      }),
    })
  } catch (error) {
    if (!match) {
      try { await supabaseAuthRequest(`admin/users/${authUser.id}`, { method: 'DELETE' }) } catch { /* Conserva el error original del perfil si también falla la limpieza. */ }
    }
    throw error
  }
  return authUser.id
}

// Actualiza nombre, rol y colegio del perfil remoto.
export async function updateSupabaseProfile(id, { name, role, school }) {
  const schoolMatch = school
    ? (await listSupabaseSchools()).find(item => item.name.toLocaleLowerCase('es') === school.toLocaleLowerCase('es'))
    : null
  await supabaseRequest(`profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ name, role, school_id: schoolMatch?.id || null }),
  })
}

// Elimina la cuenta de autenticación remota mediante la API administrativa.
export async function deleteSupabaseAccount(id) {
  await supabaseAuthRequest(`admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
