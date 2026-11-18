const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.')
  console.error('Copia .env.example a .env y completa los valores desde Supabase.')
  process.exit(1)
}

let baseUrl
try {
  baseUrl = new URL(SUPABASE_URL)
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
    throw new Error('La URL debe usar HTTPS.')
  }
} catch (error) {
  console.error(`SUPABASE_URL no es válida: ${error.message}`)
  process.exit(1)
}

const endpoint = new URL('/rest/v1/schools?select=id&limit=1', baseUrl)
try {
  const response = await fetch(endpoint, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      ...(!SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_') ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {}),
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    console.error(`Supabase respondió HTTP ${response.status}.`)
    if (detail) console.error(detail)
    process.exit(1)
  }

  console.log('Conexión correcta: el backend pudo consultar public.schools en Supabase.')
} catch (error) {
  console.error(`No se pudo conectar con Supabase: ${error.message}`)
  process.exit(1)
}
