import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync, existsSync, statSync, unlinkSync, openSync, writeSync, closeSync, readFileSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createSupabaseSchool, deleteSupabaseAccount, listSupabaseSchools,
  getSupabaseAuthUser, refreshSupabaseSession, registerSupabaseAccount,
  revokeSupabaseSession, signInSupabaseAccount, supabaseAuthConfigured,
  supabaseConfigured, updateSupabaseProfile,
} from './supabase.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const directory = resolve(process.env.DATA_DIR || join(root, 'data'))
const uploads = join(directory, 'uploads')
mkdirSync(uploads, { recursive: true })
const db = new DatabaseSync(join(directory, 'school.sqlite'))
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher')),
    school TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
    url TEXT, filename TEXT, mime TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activity_records (
    id TEXT PRIMARY KEY,
    teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    teacher_name TEXT NOT NULL, teacher_ref TEXT NOT NULL, school TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 180),
    performed_on TEXT NOT NULL,
    video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS activity_teacher_date ON activity_records(teacher_id, performed_on);
  CREATE INDEX IF NOT EXISTS activity_date ON activity_records(performed_on);
  CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL, organization TEXT NOT NULL,
    sections TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)
// Upgrade the role constraint without changing user IDs or foreign references.
if (!db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get().sql.includes("'school'")) {
 db.exec(`PRAGMA foreign_keys=OFF; BEGIN;
 CREATE TABLE users_new (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','school')),school TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO users_new SELECT * FROM users; DROP TABLE users;
 ALTER TABLE users_new RENAME TO users; COMMIT; PRAGMA foreign_keys=ON;`)
}
db.exec(`CREATE TABLE IF NOT EXISTS schools(id TEXT PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL);
 INSERT OR IGNORE INTO schools(id,name) SELECT lower(hex(randomblob(16))),school FROM users WHERE school!='';`)
// Rutinas compartidas con docentes específicos (sin hacerlas públicas).
// Si se borra la rutina o el docente, la fila se elimina sola (ON DELETE CASCADE).
db.exec(`CREATE TABLE IF NOT EXISTS routine_shares (
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (routine_id, teacher_id)
)`)
for (const [name, definition] of [['course', "TEXT NOT NULL DEFAULT ''"], ['intensity', "TEXT NOT NULL DEFAULT 'Media'"]]) {
 if (!db.prepare('PRAGMA table_info(routines)').all().some(c => c.name === name)) db.exec('ALTER TABLE routines ADD COLUMN ' + name + ' ' + definition)
}
// Preserve a stable reporting identity when an account is deleted.
if (!db.prepare('PRAGMA table_info(activity_records)').all().some(column => column.name === 'teacher_ref')) {
  db.exec('ALTER TABLE activity_records ADD COLUMN teacher_ref TEXT')
  db.exec('UPDATE activity_records SET teacher_ref=COALESCE(teacher_id,id)')
}
if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'auth_id')) {
  db.exec('ALTER TABLE users ADD COLUMN auth_id TEXT')
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'Ingresa una fecha válida.')
  return value
}
async function schoolName(value) {
  const name = text(value, 'Colegio', 150).replace(/\s+/g, ' ')
  const canonical = db.prepare('SELECT name FROM schools WHERE name=? COLLATE NOCASE').get(name)?.name || name
  if (!supabaseConfigured()) {
    db.prepare('INSERT OR IGNORE INTO schools(id,name) VALUES(?,?)').run(randomUUID(), canonical)
    return canonical
  }
  const schools = await listSupabaseSchools()
  const existing = schools.find(school => school.name.toLocaleLowerCase('es') === canonical.toLocaleLowerCase('es'))
  if (existing) return existing.name
  try {
    const created = await createSupabaseSchool(canonical)
    return created.name
  } catch (error) {
    if (error.code !== '23505') throw error
    const refreshed = await listSupabaseSchools()
    const concurrent = refreshed.find(school => school.name.toLocaleLowerCase('es') === canonical.toLocaleLowerCase('es'))
    if (concurrent) return concurrent.name
    throw error
  }
}
async function syncStoredSchools() {
  if (!supabaseConfigured()) return
  const names = new Set([
    ...db.prepare('SELECT name FROM schools').all().map(row => row.name),
    ...db.prepare("SELECT DISTINCT school AS name FROM users WHERE school!=''").all().map(row => row.name),
  ])
  for (const name of names) await schoolName(name)
}
function report(user, url) {
  const from = url.searchParams.get('from') ? dateValue(url.searchParams.get('from')) : '2000-01-01'
  const to = url.searchParams.get('to') ? dateValue(url.searchParams.get('to')) : today()
  if (from > to) fail(400, 'La fecha inicial debe ser anterior o igual a la final.')
  const schoolFilter = user.role === 'admin' ? url.searchParams.get('school') || '' : ''
  const records = user.role === 'school' ? db.prepare('SELECT * FROM activity_records WHERE school=? AND performed_on BETWEEN ? AND ? ORDER BY performed_on DESC').all(user.school, from, to) : user.role === 'admin'
    ? db.prepare('SELECT * FROM activity_records WHERE performed_on BETWEEN ? AND ? ORDER BY performed_on DESC, created_at DESC, rowid DESC').all(from, to)
    : db.prepare('SELECT * FROM activity_records WHERE teacher_id=? AND performed_on BETWEEN ? AND ? ORDER BY performed_on DESC, created_at DESC, rowid DESC').all(user.id, from, to)
  const currentTeachers = user.role === 'school' ? db.prepare("SELECT id,name,school FROM users WHERE role='teacher' AND school=?").all(user.school) : user.role === 'admin' ? db.prepare("SELECT id,name,school FROM users WHERE role='teacher' ORDER BY school,name").all() : [user]
  const institutions = new Map()
  const teachers = new Map()
  const daily = new Map()
  const institution = school => {
    if (!institutions.has(school)) institutions.set(school, { school, teachers: 0, sessions: 0, minutes: 0 })
    return institutions.get(school)
  }
  for (const teacher of currentTeachers) {
    institution(teacher.school).teachers++
    teachers.set(`${teacher.id}:${teacher.school}`, { id: teacher.id, name: teacher.name, school: teacher.school, sessions: 0, minutes: 0, active: true })
  }
  for (const record of records) {
    const school = institution(record.school)
    school.sessions++; school.minutes += record.minutes
    const key = `${record.teacher_ref}:${record.school}`
    if (!teachers.has(key)) teachers.set(key, { id: record.teacher_id, name: record.teacher_name, school: record.school, sessions: 0, minutes: 0, active: currentTeachers.some(t => t.id === record.teacher_id) })
    teachers.get(key).sessions++; teachers.get(key).minutes += record.minutes
    if (!schoolFilter || schoolFilter === record.school) {
      const day = daily.get(record.performed_on) || { date: record.performed_on, sessions: 0, minutes: 0 }
      day.sessions++; day.minutes += record.minutes; daily.set(day.date, day)
    }
  }
  const selected = records.filter(r => !schoolFilter || r.school === schoolFilter)
  return {
    from, to, school_filter: schoolFilter,
    schools: [...institutions.keys()].sort((a, b) => a.localeCompare(b, 'es')),
    totals: { sessions: selected.length, minutes: selected.reduce((sum, r) => sum + r.minutes, 0), teachers: currentTeachers.filter(t => !schoolFilter || t.school === schoolFilter).length },
    institutions: [...institutions.values()].filter(s => !schoolFilter || s.school === schoolFilter),
    teachers: [...teachers.values()].filter(t => !schoolFilter || t.school === schoolFilter),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    history: selected.slice(0, 50),
  }
}

const categories = ['Movimiento', 'Baile', 'Respiración', 'Estiramientos']
const uploadLimit = 100 * 1024 * 1024
const publicUser = ({ password, auth_id, ...user }) => user
const digest = value => createHash('sha256').update(value).digest('hex')
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':')
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'))
}
function fail(status, message) { throw Object.assign(new Error(message), { status }) }
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
async function json(req) {
  const buffers = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16384) fail(413, 'La solicitud es demasiado grande.')
    buffers.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(buffers).toString()) } catch { fail(400, 'Datos no válidos.') }
}
function text(value, label, max = 120, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${label}: ingresa entre ${min} y ${max} caracteres.`)
  return value.trim()
}
function account(body) {
  const name = text(body.name, 'Nombre', 100)
  const email = text(body.email, 'Correo', 200).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Ingresa un correo válido.')
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) fail(400, 'La contraseña debe tener entre 8 y 128 caracteres.')
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) fail(409, 'Ya existe una cuenta con ese correo.')
  return { name, email, password: passwordHash(supabaseConfigured() ? randomBytes(32).toString('hex') : body.password) }
}
function sessionToken(req) {
  return req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('pausa_session='))?.slice(14) || null
}
function supabaseTokens(token) {
  if (!token?.startsWith('supa.')) return null
  try { return JSON.parse(Buffer.from(token.slice(5), 'base64url').toString()) } catch { return null }
}
function setAuthCookie(res, session) {
  const value = `supa.${Buffer.from(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }), 'utf8').toString('base64url')}`
  res.setHeader('Set-Cookie', `pausa_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`)
}
async function session(req, res) {
  const token = sessionToken(req)
  if (!token) return null
  const stored = supabaseTokens(token)
  if (stored?.access_token && stored?.refresh_token) {
    let authUser
    try {
      authUser = await getSupabaseAuthUser(stored.access_token)
    } catch (error) {
      if (error.status !== 401) throw error
      try {
        const refreshed = await refreshSupabaseSession(stored.refresh_token)
        setAuthCookie(res, refreshed)
        authUser = refreshed.user
      } catch (refreshError) {
        if (refreshError.status === 401) return null
        throw refreshError
      }
    }
    return db.prepare('SELECT * FROM users WHERE auth_id=?').get(authUser.id) || null
  }
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(token), Date.now()) || null
}
function newSession(res, user, authSession = null) {
  if (authSession?.access_token && authSession?.refresh_token) {
    setAuthCookie(res, authSession)
    return
  }
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now())
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(digest(token), user.id, Date.now() + 7 * 86400000)
  res.setHeader('Set-Cookie', `pausa_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`)
}
function videoDetails(body) {
  const title = text(body.title, 'Título')
  const description = text(body.description || '', 'Descripción', 1000, 0)
  if (!categories.includes(body.category)) fail(400, 'Selecciona una categoría válida.')
  return { title, description, category: body.category }
}
function validVideoUrl(raw) {
  let url
  try { url = new URL(raw) } catch { fail(400, 'Ingresa un enlace de video válido.') }
  if (url.protocol !== 'https:') fail(400, 'El enlace debe comenzar con https://.')
  if (url.username || url.password) fail(400, 'El enlace no debe incluir credenciales.')
  const host = url.hostname.toLowerCase()
  let id
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)$/)?.[1]
  if (host === 'youtu.be') id = url.pathname.slice(1)
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
  if (['vimeo.com', 'www.vimeo.com'].includes(host) && /^\/\d+$/.test(url.pathname)) return `https://player.vimeo.com/video/${url.pathname.slice(1)}`
  if (/\.(mp4|webm)$/i.test(url.pathname)) return url.href
  fail(400, 'Usa un enlace de YouTube, Vimeo o un archivo directo MP4/WebM.')
}
function removeFile(filename) { if (filename && existsSync(join(uploads, filename))) unlinkSync(join(uploads, filename)) }
const attempts = new Map()
function rateLimit(req) {
  const key = req.socket.remoteAddress
  const now = Date.now()
  for (const [address, record] of attempts) if (record.until < now) attempts.delete(address)
  const record = attempts.get(key) || { count: 0, until: now + 15 * 60000 }
  record.count++; attempts.set(key, record)
  if (record.count > 30) fail(429, 'Demasiados intentos. Intenta nuevamente en 15 minutos.')
}

async function api(req, res, url) {
  const path = url.pathname
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail(403, 'Origen de solicitud no permitido.')
  if (path === '/api/setup' && req.method === 'GET') return send(res, 200, { required: !db.prepare("SELECT id FROM users WHERE role='admin'").get() })
  if (path === '/api/setup' && req.method === 'POST') {
    if (db.prepare("SELECT id FROM users WHERE role='admin'").get()) fail(403, 'La escuela ya está configurada.')
    const body = await json(req)
    const data = account(body)
    const school = await schoolName(body.school)
    // Check again after awaiting the body to prevent concurrent initializations.
    if (db.prepare("SELECT id FROM users WHERE role='admin'").get()) fail(403, 'La escuela ya está configurada.')
    const auth_id = supabaseConfigured() ? await registerSupabaseAccount({ email: data.email, password: body.password, name: data.name, role: 'admin', school }) : null
    const user = { id: randomUUID(), ...data, auth_id, school, role: 'admin' }
    db.prepare('INSERT INTO users(id,name,email,password,role,school,auth_id) VALUES(?,?,?,?,?,?,?)').run(user.id, user.name, user.email, user.password, user.role, school, auth_id)
    const authSession = supabaseConfigured() ? await signInSupabaseAccount(user.email, body.password) : null
    newSession(res, user, authSession)
    return send(res, 201, { user: publicUser(user) })
  }
  if (path === '/api/login' && req.method === 'POST') {
    rateLimit(req)
    const body = await json(req)
    const email = text(body.email, 'Correo', 200).toLowerCase()
    if (typeof body.password !== 'string' || body.password.length > 128) fail(400, 'Contraseña no válida.')
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    let authSession = null
    if (user && passwordMatches(body.password, user.password) && supabaseConfigured() && !user.auth_id) {
      user.auth_id = await registerSupabaseAccount({ email: user.email, password: body.password, name: user.name, role: user.role, school: user.school })
      db.prepare('UPDATE users SET auth_id=? WHERE id=?').run(user.auth_id, user.id)
    }
    if (user && supabaseConfigured()) {
      if (!supabaseAuthConfigured()) fail(503, 'Falta SUPABASE_PUBLISHABLE_KEY en .env.')
      if (!user.auth_id) {
        if (!passwordMatches(body.password, user.password)) fail(401, 'Correo o contrasena incorrectos.')
        user.auth_id = await registerSupabaseAccount({ email: user.email, password: body.password, name: user.name, role: user.role, school: user.school })
      }
      authSession = await signInSupabaseAccount(user.email, body.password)
      if (authSession.user?.id !== user.auth_id) fail(401, 'Correo o contrasena incorrectos.')
      db.prepare('UPDATE users SET auth_id=?,password=? WHERE id=?').run(user.auth_id, passwordHash(randomBytes(32).toString('hex')), user.id)
      user.password = passwordHash(body.password)
    }
    if (!user || !passwordMatches(body.password, user.password)) fail(401, 'Correo o contraseña incorrectos.')
    newSession(res, user, authSession)
    return send(res, 200, { user: publicUser(user) })
  }
  if (path === '/api/logout' && req.method === 'POST') {
    const token = sessionToken(req)
    const stored = supabaseTokens(token)
    res.setHeader('Set-Cookie', 'pausa_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
    if (stored?.access_token) {
      try {
        await revokeSupabaseSession(stored.access_token)
      } catch (error) {
        if (error.status !== 401 || !stored.refresh_token) throw error
        try {
          const refreshed = await refreshSupabaseSession(stored.refresh_token)
          await revokeSupabaseSession(refreshed.access_token)
        } catch (refreshError) {
          if (refreshError.status !== 401) throw refreshError
        }
      }
    } else if (token) {
      db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token))
    }
    return send(res, 200, { ok: true })
  }
  const user = await session(req, res)
  if (!user) fail(401, 'Inicia sesión para continuar.')
  if (path === '/api/me' && req.method === 'GET') return send(res, 200, { user: publicUser(user) })
  // Docentes con los que se puede compartir una rutina (todos menos uno mismo).
  if (path === '/api/colleagues' && req.method === 'GET') {
    if (!['teacher','admin'].includes(user.role)) fail(403, 'No puedes compartir rutinas.')
    return send(res, 200, { colleagues: db.prepare("SELECT id,name,school FROM users WHERE role='teacher' AND id!=? ORDER BY school,name").all(user.id) })
  }
  if (path === '/api/routines' && req.method === 'GET') {
    // Cada usuario ve: las públicas, las suyas, las que le compartieron y (si es admin) todas.
    const routines = db.prepare(`SELECT r.*,u.name AS teacher_name,u.school,
      EXISTS(SELECT 1 FROM routine_shares s WHERE s.routine_id=r.id AND s.teacher_id=?) AS shared_with_me
      FROM routines r JOIN users u ON u.id=r.teacher_id
      WHERE r.shared=1 OR r.teacher_id=? OR ?='admin' OR EXISTS(SELECT 1 FROM routine_shares s WHERE s.routine_id=r.id AND s.teacher_id=?)
      ORDER BY r.updated_at DESC,r.rowid DESC`).all(user.id, user.id, user.role, user.id)
    const sharesOf = db.prepare('SELECT s.teacher_id,u.name,u.school FROM routine_shares s JOIN users u ON u.id=s.teacher_id WHERE s.routine_id=? ORDER BY u.name')
    return send(res, 200, { routines: routines.map(r => ({
      ...r, sections: JSON.parse(r.sections), shared: !!r.shared, shared_with_me: !!r.shared_with_me,
      // Solo el autor y el administrador ven la lista de docentes invitados.
      shared_with: r.teacher_id === user.id || user.role === 'admin' ? sharesOf.all(r.id) : [],
    })) })
  }
  const routineId = path.match(/^\/api\/routines\/([\w-]+)$/)?.[1]
  if (routineId && req.method === 'DELETE') {
    const existing = db.prepare('SELECT teacher_id FROM routines WHERE id=?').get(routineId)
    if (!existing) fail(404, 'Rutina no encontrada.')
    // Solo el autor o el administrador pueden eliminar una rutina.
    if (existing.teacher_id !== user.id && user.role !== 'admin') fail(403, 'Solo puedes eliminar tus propias rutinas.')
    db.prepare('DELETE FROM routines WHERE id=?').run(routineId)
    return send(res, 200, { ok: true })
  }
  if ((path === '/api/routines' && req.method === 'POST') || (routineId && req.method === 'PUT')) {
    if (!['teacher','admin'].includes(user.role)) fail(403, 'No puedes crear rutinas.')
    let ownerId = user.id
    if (routineId) {
      const existing = db.prepare('SELECT * FROM routines WHERE id=?').get(routineId)
      if (!existing) fail(404, 'Rutina no encontrada.')
      if (existing.teacher_id !== user.id && user.role !== 'admin') fail(403, 'Solo puedes editar tus propias rutinas.')
      ownerId = existing.teacher_id
    }
    const body = await json(req)
    // shared_with: lista de ids de docentes invitados. Si no viene, se conserva la lista actual.
    let sharedWith = null
    if (body.shared_with !== undefined) {
      if (!Array.isArray(body.shared_with) || body.shared_with.length > 50) fail(400, 'Puedes compartir con hasta 50 profesores.')
      sharedWith = [...new Set(body.shared_with)]
      for (const teacherId of sharedWith) {
        if (typeof teacherId !== 'string' || teacherId === ownerId || !db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(teacherId)) fail(400, 'Uno de los profesores seleccionados no está disponible.')
      }
    }
    const course = text(body.course || '', 'Curso', 100, 0)
    const intensity = body.intensity || 'Media'
    if (!['Baja','Media','Alta'].includes(intensity)) fail(400, 'Intensidad no válida.')
    const title = text(body.title, 'Título')
    const description = text(body.description || '', 'Descripción', 2000, 0)
    if (!['Sesiones', 'Bloques', 'Días'].includes(body.organization)) fail(400, 'Selecciona una organización válida.')
    if (typeof body.shared !== 'boolean') fail(400, 'Selecciona la visibilidad de la rutina.')
    if (!Array.isArray(body.sections) || !body.sections.length || body.sections.length > 20) fail(400, 'Agrega entre 1 y 20 secciones.')
    const sections = body.sections.map(section => {
      const name = text(section.name, 'Nombre de sección', 100)
      if (!Array.isArray(section.exercises) || !section.exercises.length || section.exercises.length > 30) fail(400, 'Cada sección debe tener entre 1 y 30 ejercicios.')
      return { name, exercises: section.exercises.map(exercise => {
        if (typeof exercise.video_id !== 'string' || !db.prepare('SELECT id FROM videos WHERE id=?').get(exercise.video_id)) fail(400, 'Un ejercicio ya no está disponible. Selecciona otro.')
        if (!Number.isInteger(exercise.minutes) || exercise.minutes < 1 || exercise.minutes > 180) fail(400, 'La duración debe ser de 1 a 180 minutos.')
        return { video_id: exercise.video_id, minutes: exercise.minutes }
      }) }
    })
    const id = routineId || randomUUID()
    if (routineId) db.prepare('UPDATE routines SET title=?,description=?,organization=?,sections=?,shared=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title, description, body.organization, JSON.stringify(sections), Number(body.shared), id)
    else db.prepare('INSERT INTO routines(id,teacher_id,title,description,organization,sections,shared) VALUES(?,?,?,?,?,?,?)').run(id, user.id, title, description, body.organization, JSON.stringify(sections), Number(body.shared))
    db.prepare('UPDATE routines SET course=?,intensity=? WHERE id=?').run(course,intensity,id)
    if (sharedWith) {
      // Se reemplaza la lista completa de invitados.
      db.prepare('DELETE FROM routine_shares WHERE routine_id=?').run(id)
      const insert = db.prepare('INSERT INTO routine_shares(routine_id,teacher_id) VALUES(?,?)')
      for (const teacherId of sharedWith) insert.run(id, teacherId)
    }
    return send(res, routineId ? 200 : 201, { id })
  }
  if (path === '/api/reports' && req.method === 'GET') return send(res, 200, report(user, url))
  if (path === '/api/activity' && req.method === 'POST') {
    if (user.role !== 'teacher') fail(403, 'Solo los docentes pueden registrar sus pausas.')
    const body = await json(req)
    const id = text(body.id, 'Identificador', 36)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) fail(400, 'Identificador no válido.')
    if (!Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 180) fail(400, 'La pausa debe durar entre 1 y 180 minutos enteros.')
    const date = dateValue(body.performed_on)
    if (date > today() || date < '2000-01-01') fail(400, 'La fecha debe estar entre el año 2000 y hoy.')
    const existing = db.prepare('SELECT * FROM activity_records WHERE id=?').get(id)
    if (existing) {
      if (existing.teacher_id !== user.id || existing.minutes !== body.minutes || existing.performed_on !== date || existing.video_id !== (body.video_id || null)) fail(409, 'Este registro ya existe con otros datos.')
      return send(res, 200, { id, duplicate: true })
    }
    if (body.video_id && !db.prepare('SELECT id FROM videos WHERE id=?').get(body.video_id)) fail(404, 'Video no encontrado.')
    // Re-read identity after receiving the body so the school snapshot is current.
    const teacher = db.prepare("SELECT * FROM users WHERE id=? AND role='teacher'").get(user.id)
    if (!teacher) fail(401, 'La cuenta ya no está disponible.')
    db.prepare('INSERT INTO activity_records(id,teacher_id,teacher_name,teacher_ref,school,minutes,performed_on,video_id) VALUES(?,?,?,?,?,?,?,?)').run(id, teacher.id, teacher.name, teacher.id, teacher.school, body.minutes, date, body.video_id || null)
    return send(res, 201, { id })
  }
  if (path === '/api/schools' && req.method === 'GET') {
    if (!supabaseConfigured()) return send(res, 200, { schools: user.role === 'admin' ? db.prepare('SELECT * FROM schools ORDER BY name').all() : db.prepare('SELECT * FROM schools WHERE name=?').all(user.school) })
    await syncStoredSchools()
    const schools = await listSupabaseSchools()
    return send(res, 200, { schools: user.role === 'admin' ? schools : schools.filter(school => school.name === user.school) })
  }
  if (path === '/api/schools' && req.method === 'POST') {
    if (user.role !== 'admin') fail(403, 'Solo el administrador puede crear colegios.')
    const name = text((await json(req)).name, 'Colegio', 150).replace(/\s+/g, ' ')
    if (!supabaseConfigured()) {
      if (db.prepare('SELECT id FROM schools WHERE name=? COLLATE NOCASE').get(name)) fail(409, 'Este colegio ya existe.')
      const id = randomUUID(); db.prepare('INSERT INTO schools(id,name) VALUES(?,?)').run(id,name)
      return send(res, 201, { id, name })
    }
    if ((await listSupabaseSchools()).some(school => school.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) fail(409, 'Este colegio ya existe.')
    try {
      const school = await createSupabaseSchool(name)
      return send(res, 201, school)
    } catch (error) {
      if (error.code === '23505') fail(409, 'Este colegio ya existe.')
      throw error
    }
  }
  if (path === '/api/users') {
    if (user.role !== 'admin') fail(403, 'Solo el administrador puede gestionar usuarios.')
    if (req.method === 'GET') return send(res, 200, { users: db.prepare('SELECT id,name,email,role,school FROM users ORDER BY name').all() })
    if (req.method === 'POST') {
      const body = await json(req), data = account(body)
      if (!['admin','teacher','school'].includes(body.role)) fail(400, 'Perfil no válido.')
      const school = await schoolName(body.school), id = randomUUID()
      const auth_id = supabaseConfigured() ? await registerSupabaseAccount({ email: data.email, password: body.password, name: data.name, role: body.role, school }) : null
      db.prepare('INSERT INTO users(id,name,email,password,role,school,auth_id) VALUES(?,?,?,?,?,?,?)').run(id,data.name,data.email,data.password,body.role,school,auth_id)
      return send(res, 201, { id })
    }
  }
  if (path === '/api/teachers' && req.method === 'GET' && user.role === 'school') {
    return send(res, 200, { teachers: db.prepare("SELECT u.id,u.name,u.email,u.school,(SELECT COALESCE(SUM(minutes),0) FROM activity_records a WHERE a.teacher_id=u.id AND a.school=u.school) AS minutes,(SELECT COUNT(*) FROM activity_records a WHERE a.teacher_id=u.id AND a.school=u.school) AS session_count,(SELECT COUNT(*) FROM videos v WHERE v.teacher_id=u.id) AS video_count FROM users u WHERE role='teacher' AND school=? ORDER BY name").all(user.school) })
  }
  if (path.startsWith('/api/teachers')) {
    if (user.role !== 'admin') fail(403, 'Solo el administrador puede gestionar docentes.')
    if (path === '/api/teachers' && req.method === 'GET') return send(res, 200, { teachers: db.prepare("SELECT u.id,u.name,u.email,u.school,u.created_at,(SELECT COUNT(*) FROM videos v WHERE v.teacher_id=u.id) AS video_count,(SELECT COUNT(*) FROM activity_records a WHERE a.teacher_id=u.id) AS session_count,(SELECT COALESCE(SUM(minutes),0) FROM activity_records a WHERE a.teacher_id=u.id) AS minutes FROM users u WHERE u.role='teacher' ORDER BY u.created_at DESC,u.name").all() })
    if (path === '/api/teachers' && req.method === 'POST') {
      const body = await json(req)
      const data = account(body)
      const school = body.school === undefined ? user.school : await schoolName(body.school)
      const id = randomUUID()
      const auth_id = supabaseConfigured() ? await registerSupabaseAccount({ email: data.email, password: body.password, name: data.name, role: 'teacher', school }) : null
      db.prepare('INSERT INTO users(id,name,email,password,role,school,auth_id) VALUES(?,?,?,?,?,?,?)').run(id, data.name, data.email, data.password, 'teacher', school, auth_id)
      return send(res, 201, { teacher: { id, name: data.name, email: data.email, school, video_count: 0, session_count: 0, minutes: 0 } })
    }
    const id = path.match(/^\/api\/teachers\/([\w-]+)$/)?.[1]
    if (id && req.method === 'PATCH') {
      const body = await json(req)
      const name = text(body.name, 'Nombre', 100)
      const school = await schoolName(body.school)
      const profile = db.prepare("SELECT auth_id FROM users WHERE id=? AND role='teacher'").get(id)
      if (profile?.auth_id && supabaseConfigured()) await updateSupabaseProfile(profile.auth_id, { name, role: 'teacher', school })
      const result = db.prepare("UPDATE users SET name=?,school=? WHERE id=? AND role='teacher'").run(name, school, id)
      if (!result.changes) fail(404, 'Docente no encontrado.')
      return send(res, 200, { ok: true })
    }
    if (id && req.method === 'DELETE') {
      const teacher = db.prepare("SELECT id,auth_id FROM users WHERE id=? AND role='teacher'").get(id)
      if (!teacher) fail(404, 'Docente no encontrado.')
      if (teacher.auth_id && supabaseConfigured()) await deleteSupabaseAccount(teacher.auth_id)
      const files = db.prepare('SELECT filename FROM videos WHERE teacher_id=?').all(id)
      db.prepare('DELETE FROM users WHERE id=?').run(id)
      for (const file of files) removeFile(file.filename)
      return send(res, 200, { ok: true })
    }
  }
  if (path === '/api/videos' && req.method === 'GET') return send(res, 200, { videos: db.prepare('SELECT v.*,u.name AS teacher_name FROM videos v JOIN users u ON u.id=v.teacher_id ORDER BY v.created_at DESC,v.rowid DESC').all() })
  if (path === '/api/videos' && req.method === 'POST') {
    if (user.role !== 'teacher') fail(403, 'Solo los docentes pueden agregar videos.')
    const body = await json(req)
    const details = videoDetails(body)
    const videoUrl = validVideoUrl(body.url)
    const id = randomUUID()
    db.prepare('INSERT INTO videos(id,teacher_id,title,description,category,url) VALUES(?,?,?,?,?,?)').run(id, user.id, details.title, details.description, details.category, videoUrl)
    return send(res, 201, { id })
  }
  if (path === '/api/videos/upload' && req.method === 'POST') {
    if (user.role !== 'teacher') fail(403, 'Solo los docentes pueden agregar videos.')
    const details = videoDetails(Object.fromEntries(url.searchParams))
    const mime = req.headers['content-type']
    if (!['video/mp4', 'video/webm'].includes(mime)) fail(400, 'Selecciona un archivo MP4 o WebM.')
    if (Number(req.headers['content-length']) > uploadLimit) fail(413, 'El video supera el máximo de 100 MB.')
    const id = randomUUID()
    const filename = `${id}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`
    const target = join(uploads, filename)
    const fd = openSync(target, 'wx')
    let size = 0
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > uploadLimit) fail(413, 'El video supera el máximo de 100 MB.')
        writeSync(fd, chunk)
      }
      if (size < 12) fail(400, 'El archivo de video está vacío o no es válido.')
      const header = Buffer.alloc(12)
      const { readSync } = await import('node:fs')
      const check = openSync(target, 'r')
      try { readSync(check, header, 0, 12, 0) } finally { closeSync(check) }
      if (mime === 'video/mp4' ? header.toString('ascii', 4, 8) !== 'ftyp' : header.subarray(0, 4).toString('hex') !== '1a45dfa3') fail(400, 'El contenido del archivo no corresponde a un video MP4/WebM.')
      db.prepare('INSERT INTO videos(id,teacher_id,title,description,category,filename,mime) VALUES(?,?,?,?,?,?,?)').run(id, user.id, details.title, details.description, details.category, filename, mime)
    } catch (error) {
      closeSync(fd); removeFile(filename); throw error
    }
    closeSync(fd)
    return send(res, 201, { id })
  }
  const fileId = path.match(/^\/api\/videos\/([\w-]+)\/file$/)?.[1]
  if (fileId && req.method === 'GET') {
    const video = db.prepare('SELECT * FROM videos WHERE id=?').get(fileId)
    if (!video?.filename || !existsSync(join(uploads, video.filename))) fail(404, 'Video no encontrado.')
    const file = join(uploads, video.filename)
    const size = statSync(file).size
    let start = 0; let end = size - 1; let status = 200
    if (req.headers.range) {
      const match = req.headers.range.match(/^bytes=(\d*)-(\d*)$/)
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
      end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
      status = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    }
    res.writeHead(status, { 'Content-Type': video.mime, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' })
    const stream = createReadStream(file, { start, end })
    stream.on('error', () => res.destroy())
    res.on('close', () => stream.destroy())
    return stream.pipe(res)
  }
  const videoId = path.match(/^\/api\/videos\/([\w-]+)$/)?.[1]
  if (videoId && req.method === 'DELETE') {
    const video = db.prepare('SELECT * FROM videos WHERE id=?').get(videoId)
    if (!video) fail(404, 'Video no encontrado.')
    // El autor elimina sus videos; el administrador puede retirar cualquiera (moderación).
    if (user.role !== 'admin' && (user.role !== 'teacher' || video.teacher_id !== user.id)) fail(403, 'Solo puedes eliminar tus propios videos.')
    db.prepare('DELETE FROM videos WHERE id=?').run(videoId)
    removeFile(video.filename)
    return send(res, 200, { ok: true })
  }
  fail(404, 'Recurso no encontrado.')
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  try {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Método no permitido.')
    const dist = join(root, 'dist')
    const target = resolve(dist, '.' + decodeURIComponent(url.pathname))
    if (!target.startsWith(dist + '/') && !target.startsWith(dist + '\\') && target !== dist) fail(404, 'Recurso no encontrado.')
    const file = existsSync(target) && statSync(target).isFile() ? target : join(dist, 'index.html')
    if (!existsSync(file)) fail(404, 'Ejecuta npm run build o usa npm run dev.')
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
  } catch (error) {
    if (res.headersSent || res.destroyed) return
    if (!error.status) console.error(error)
    send(res, error.status || 500, { error: error.status ? error.message : 'No se pudo completar la operación.' })
  }
})
server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log(`Escuela API: http://127.0.0.1:${server.address().port}`))
