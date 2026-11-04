import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'

test('Escuela: cuentas, permisos, videos, persistencia y revocación de acceso', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pausa-test-'))
  let processHandle
  let base
  async function start() {
    processHandle = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DATA_DIR: directory, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
    base = await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error('El servidor no inició')), 10000)
      processHandle.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/http:\/\/127.0.0.1:\d+/)
        if (match) { clearTimeout(timeout); resolve(match[0]) }
      })
      processHandle.on('error', reject)
      processHandle.on('exit', code => { clearTimeout(timeout); reject(new Error(`Servidor terminó: ${code}`)) })
    })
  }
  async function stop() { if (processHandle && processHandle.exitCode === null) { const closed = once(processHandle, 'exit'); processHandle.kill(); await closed } }
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }) })
  await start()
  async function request(path, { method = 'GET', body, cookie, headers = {}, raw = false } = {}) {
    const response = await fetch(base + '/api' + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? raw ? body : JSON.stringify(body) : undefined })
    const data = await response.json().catch(() => ({}))
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  assert.equal((await request('/setup')).data.required, true)
  assert.equal((await request('/teachers')).status, 401)
  assert.equal((await request('/videos')).status, 401)
  const admin = await request('/setup', { method: 'POST', body: { school: 'Escuela de prueba', name: 'Administración', email: 'admin@escuela.cl', password: 'ClaveSegura123' } })
  assert.equal(admin.status, 201)
  assert.equal(admin.data.user.password, undefined)
  // Browser POST requests include Origin; the development proxy must preserve Host.
  const { createServer } = await import('vite')
  const { default: config } = await import('../vite.config.js')
  const preview = await createServer({
    ...config,
    configFile: false,
    logLevel: 'silent',
    server: { ...config.server, port: 0, proxy: { '/api': { ...config.server.proxy['/api'], target: base } } },
  })
  t.after(() => preview.close())
  await preview.listen()
  const previewOrigin = `http://127.0.0.1:${preview.httpServer.address().port}`
  const browserLogin = await fetch(`${previewOrigin}/api/login`, {
    method: 'POST',
    headers: { Origin: previewOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@escuela.cl', password: 'ClaveSegura123' }),
  })
  assert.equal(browserLogin.status, 200)
  assert.equal((await browserLogin.json()).user.role, 'admin')
  const foreignOrigin = await fetch(`${previewOrigin}/api/login`, {
    method: 'POST',
    headers: { Origin: 'https://otro-sitio.cl', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@escuela.cl', password: 'ClaveSegura123' }),
  })
  assert.equal(foreignOrigin.status, 403)
  await preview.close()
  assert.equal((await request('/setup', { method: 'POST', body: {} })).status, 403)
  assert.equal((await request('/login', { method: 'POST', body: { email: 'admin@escuela.cl', password: 'incorrecta' } })).status, 401)
  assert.equal((await request('/teachers', { method: 'POST', cookie: admin.cookie, body: { name: 'Ana', email: 'ana@escuela.cl', password: 'corta' } })).status, 400)
  const teacher = await request('/teachers', { method: 'POST', cookie: admin.cookie, body: { name: 'Ana Docente', email: 'ana@escuela.cl', password: 'Docente123' } })
  assert.equal(teacher.status, 201)
  assert.equal((await request('/teachers', { method: 'POST', cookie: admin.cookie, body: { name: 'Otra Ana', email: 'ANA@escuela.cl', password: 'Docente123' } })).status, 409)
  const teacher2 = await request('/teachers', { method: 'POST', cookie: admin.cookie, body: { name: 'Luis Docente', school: 'Colegio Sur', email: 'luis@escuela.cl', password: 'Docente123' } })
  const login = await request('/login', { method: 'POST', body: { email: 'ana@escuela.cl', password: 'Docente123' } })
  assert.equal(login.data.user.role, 'teacher')
  const login2 = await request('/login', { method: 'POST', body: { email: 'luis@escuela.cl', password: 'Docente123' } })
  assert.equal((await request('/teachers', { cookie: login.cookie })).status, 403)
  assert.equal((await request('/teachers', { method: 'POST', cookie: login.cookie, body: {} })).status, 403)
  assert.equal((await request(`/teachers/${teacher2.data.teacher.id}`, { method: 'DELETE', cookie: login.cookie })).status, 403)
  const video = { title: 'Pausa en el aula', description: 'Una prueba', category: 'Movimiento', url: 'https://youtu.be/dQw4w9WgXcQ' }
  assert.equal((await request('/videos', { method: 'POST', cookie: admin.cookie, body: video })).status, 403)
  assert.equal((await request('/videos', { method: 'POST', cookie: login.cookie, body: { ...video, url: 'javascript:alert(1)' } })).status, 400)
  assert.equal((await request('/videos', { method: 'POST', cookie: login.cookie, body: { ...video, category: 'No existe' } })).status, 400)
  const added = await request('/videos', { method: 'POST', cookie: login.cookie, body: video })
  assert.equal(added.status, 201)
  const routine = { title: 'Semana activa', description: 'Movimiento para el aula', organization: 'Días', shared: false, sections: [{ name: 'Lunes', exercises: [{ video_id: added.data.id, minutes: 3 }] }] }
  assert.equal((await request('/routines', { method: 'POST', cookie: admin.cookie, body: routine })).status, 403)
  const createdRoutine = await request('/routines', { method: 'POST', cookie: login.cookie, body: routine })
  assert.equal(createdRoutine.status, 201)
  assert.equal((await request('/routines', { cookie: login2.cookie })).data.routines.length, 0)
  assert.equal((await request('/routines', { cookie: login.cookie })).data.routines[0].sections[0].name, 'Lunes')
  const routinePath = `/routines/${createdRoutine.data.id}`
  assert.equal((await request(routinePath, { method: 'PUT', cookie: login2.cookie, body: routine })).status, 403)
  assert.equal((await request(routinePath, { method: 'PUT', cookie: login.cookie, body: { ...routine, shared: true } })).status, 200)
  assert.equal((await request('/routines', { cookie: login2.cookie })).data.routines.length, 1)
  assert.equal((await request('/routines', { method: 'POST', cookie: login.cookie, body: { ...routine, sections: [] } })).status, 400)
  assert.equal((await request('/routines', { method: 'POST', cookie: login.cookie, body: { ...routine, sections: [{ name: 'Día', exercises: [{ video_id: 'missing', minutes: 3 }] }] } })).status, 400)
  assert.equal((await request(`/videos/${added.data.id}`, { method: 'DELETE', cookie: login2.cookie })).status, 403)
  const list = (await request('/videos', { cookie: admin.cookie })).data.videos
  assert.equal(list.length, 1)
  assert.equal(list[0].url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(list[0].teacher_name, 'Ana Docente')
  assert.equal((await request('/teachers', { cookie: admin.cookie })).data.teachers.find(u => u.id === teacher.data.teacher.id).video_count, 1)
  assert.equal((await request('/reports')).status, 401)
  const activity = { id: randomUUID(), minutes: 5, performed_on: '2025-01-10', video_id: added.data.id }
  assert.equal((await request('/activity', { method: 'POST', cookie: admin.cookie, body: activity })).status, 403)
  for (const invalid of [0, -2, 181, 1.5, '5']) assert.equal((await request('/activity', { method: 'POST', cookie: login.cookie, body: { ...activity, minutes: invalid } })).status, 400)
  for (const invalid of ['2999-01-01', '2025-02-30', 'ayer', '1999-12-31']) assert.equal((await request('/activity', { method: 'POST', cookie: login.cookie, body: { ...activity, performed_on: invalid } })).status, 400)
  assert.equal((await request('/activity', { method: 'POST', cookie: login.cookie, body: { ...activity, teacher_id: teacher2.data.teacher.id, school: 'Colegio falsificado' } })).status, 201)
  assert.equal((await request('/activity', { method: 'POST', cookie: login.cookie, body: activity })).status, 200)
  assert.equal((await request('/activity', { method: 'POST', cookie: login.cookie, body: { ...activity, minutes: 7 } })).status, 409)
  assert.equal((await request('/activity', { method: 'POST', cookie: login2.cookie, body: activity })).status, 409)
  await request('/activity', { method: 'POST', cookie: login.cookie, body: { id: randomUUID(), minutes: 10, performed_on: '2025-01-11' } })
  await request('/activity', { method: 'POST', cookie: login2.cookie, body: { id: randomUUID(), minutes: 7, performed_on: '2025-01-11' } })
  const reportPath = '/reports?from=2025-01-01&to=2025-01-31'
  const total = (await request(reportPath, { cookie: admin.cookie })).data
  assert.deepEqual(total.totals, { sessions: 3, minutes: 22, teachers: 2 })
  assert.equal(total.institutions.find(s => s.school === 'Colegio Sur').minutes, 7)
  assert.equal(total.institutions.find(s => s.school === 'Escuela de prueba').minutes, 15)
  const personal = (await request(reportPath + '&school=Colegio%20Sur&teacher_id=' + teacher2.data.teacher.id, { cookie: login.cookie })).data
  assert.equal(personal.totals.minutes, 15)
  assert.equal(personal.history.length, 2)
  assert.ok(personal.history.every(r => r.teacher_id === teacher.data.teacher.id && r.school === 'Escuela de prueba'))
  const filteredReport = (await request(reportPath + '&school=Colegio%20Sur', { cookie: admin.cookie })).data
  assert.equal(filteredReport.totals.minutes, 7)
  assert.equal(filteredReport.teachers.length, 1)
  // Institution accounts cannot escape their school by forging report filters.
  assert.equal((await request('/schools', { method:'POST', cookie:login.cookie, body:{name:'No autorizado'} })).status,403)
  assert.equal((await request('/schools', { method:'POST', cookie:admin.cookie, body:{name:'Colegio Independiente'} })).status,201)
  assert.equal((await request('/schools', { method:'POST', cookie:admin.cookie, body:{name:'colegio independiente'} })).status,409)
  assert.equal((await request('/users', { method:'POST', cookie:admin.cookie, body:{name:'Dirección Sur',email:'direccion@sur.cl',password:'Colegio123',role:'school',school:'Colegio Sur'} })).status,201)
  const schoolLogin=await request('/login',{method:'POST',body:{email:'direccion@sur.cl',password:'Colegio123'}})
  assert.equal(schoolLogin.data.user.role,'school')
  const schoolReport=(await request(reportPath+'&school=Escuela%20de%20prueba',{cookie:schoolLogin.cookie})).data
  assert.equal(schoolReport.totals.minutes,7)
  assert.ok(schoolReport.history.every(r=>r.school==='Colegio Sur'))
  const schoolTeachers=(await request('/teachers',{cookie:schoolLogin.cookie})).data.teachers
  assert.equal(schoolTeachers.length,1)
  assert.equal(schoolTeachers[0].id,teacher2.data.teacher.id)
  assert.equal((await request('/users',{cookie:schoolLogin.cookie})).status,403)
  assert.equal((await request('/teachers',{method:'POST',cookie:schoolLogin.cookie,body:{}})).status,403)
  assert.equal((await request('/routines',{method:'POST',cookie:schoolLogin.cookie,body:routine})).status,403)
  assert.equal((await request(routinePath,{method:'PUT',cookie:login.cookie,body:{...routine,course:'3° básico',intensity:'Alta'}})).status,200)
  assert.equal((await request('/routines',{cookie:schoolLogin.cookie})).data.routines.length,0)
  const privateRoutine=(await request('/routines',{cookie:admin.cookie})).data.routines.find(r=>r.id===createdRoutine.data.id)
  assert.equal(privateRoutine.course,'3° básico')
  assert.equal(privateRoutine.intensity,'Alta')
  assert.equal((await request(routinePath,{method:'PUT',cookie:login.cookie,body:{...routine,intensity:'Inválida'}})).status,400)
  assert.equal((await request('/reports?from=2025-01-11&to=2025-01-11', { cookie: admin.cookie })).data.totals.minutes, 17)
  assert.equal((await request('/reports?from=2025-02-01&to=2025-01-01', { cookie: admin.cookie })).status, 400)
  assert.equal((await request('/reports?from=2025-02-30', { cookie: admin.cookie })).status, 400)
  assert.equal((await request(`/teachers/${teacher.data.teacher.id}`, { method: 'PATCH', cookie: login.cookie, body: { name: 'Ana', school: 'Otro' } })).status, 403)
  assert.equal((await request(`/teachers/${teacher.data.teacher.id}`, { method: 'PATCH', cookie: admin.cookie, body: { name: 'Ana Docente', school: 'Colegio Nuevo' } })).status, 200)
  await request('/activity', { method: 'POST', cookie: login.cookie, body: { id: randomUUID(), minutes: 3, performed_on: '2025-01-12' } })
  const moved = (await request(reportPath, { cookie: admin.cookie })).data
  assert.equal(moved.institutions.find(s => s.school === 'Escuela de prueba').minutes, 15)
  assert.equal(moved.institutions.find(s => s.school === 'Colegio Nuevo').minutes, 3)
  const teacherTotals = (await request('/teachers', { cookie: admin.cookie })).data.teachers.find(t => t.id === teacher.data.teacher.id)
  assert.equal(teacherTotals.school, 'Colegio Nuevo')
  assert.equal(teacherTotals.minutes, 18)
  assert.equal(teacherTotals.session_count, 3)
  const uploadPath = '/videos/upload?' + new URLSearchParams({ title: 'Archivo', category: 'Baile', description: '' })
  assert.equal((await request(uploadPath, { method: 'POST', cookie: login.cookie, body: Buffer.from('not a video file'), raw: true, headers: { 'Content-Type': 'video/mp4' } })).status, 400)
  // Minimal MP4 signature is enough to exercise binary storage and byte ranges.
  const bytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
  const upload = await request(uploadPath, { method: 'POST', cookie: login.cookie, body: bytes, raw: true, headers: { 'Content-Type': 'video/mp4' } })
  assert.equal(upload.status, 201)
  assert.equal((await fetch(base + `/api/videos/${upload.data.id}/file`)).status, 401)
  const range = await fetch(base + `/api/videos/${upload.data.id}/file`, { headers: { Cookie: login2.cookie, Range: 'bytes=4-7' } })
  assert.equal(range.status, 206)
  assert.equal(await range.text(), 'ftyp')
  assert.equal((await fetch(base + `/api/videos/${upload.data.id}/file`, { headers: { Cookie: login.cookie, Range: 'bytes=999-' } })).status, 416)
  assert.equal((await request('/videos', { method: 'POST', cookie: login.cookie, body: video, headers: { Origin: 'https://otro-sitio.cl' } })).status, 403)
  await stop(); await start()
  assert.equal((await request('/me', { cookie: admin.cookie })).data.user.role, 'admin')
  assert.equal((await request('/videos', { cookie: login.cookie })).data.videos.length, 2)
  assert.equal((await request(reportPath, { cookie: admin.cookie })).data.totals.minutes, 25)
  assert.equal((await request(`/videos/${added.data.id}`, { method: 'DELETE', cookie: login.cookie })).status, 200)
  assert.equal((await request(`/teachers/${teacher.data.teacher.id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200)
  assert.equal((await request('/me', { cookie: login.cookie })).status, 401)
  assert.equal((await request('/login', { method: 'POST', body: { email: 'ana@escuela.cl', password: 'Docente123' } })).status, 401)
  assert.equal((await request('/videos', { cookie: admin.cookie })).data.videos.length, 0)
  const historical = (await request(reportPath, { cookie: admin.cookie })).data
  assert.equal(historical.totals.minutes, 25)
  assert.equal(historical.totals.sessions, 4)
  assert.equal(historical.totals.teachers, 1)
  assert.ok(historical.teachers.some(t => t.name === 'Ana Docente' && !t.active))
  assert.equal((await request('/logout', { method: 'POST', cookie: admin.cookie })).status, 200)
  assert.equal((await request('/me', { cookie: admin.cookie })).status, 401)
})
