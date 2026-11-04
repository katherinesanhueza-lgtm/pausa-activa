import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('La migración conserva cuentas, sesiones y referencias y permite el perfil colegio', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const initialization = source.slice(source.indexOf('db.exec(`'), source.indexOf('const today ='))
  const legacySchema = initialization.slice(0, initialization.indexOf('// Upgrade'))
  const db = new DatabaseSync(':memory:')
  try {
    runInNewContext(legacySchema, { db })
    db.prepare('INSERT INTO users(id,name,email,password,role,school) VALUES(?,?,?,?,?,?)').run('teacher','Ana','ana@test.cl','hash','teacher','Sur')
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('token','teacher',9999999999999)
    db.prepare('INSERT INTO videos(id,teacher_id,title,description,category) VALUES(?,?,?,?,?)').run('video','teacher','Pausa','Descripción','Baile')
    db.prepare('INSERT INTO routines(id,teacher_id,title,description,organization,sections) VALUES(?,?,?,?,?,?)').run('routine','teacher','Rutina','','Días','[]')
    runInNewContext(initialization, { db })
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1)
    assert.equal(db.prepare('SELECT teacher_id FROM videos').get().teacher_id,'teacher')
    assert.equal(db.prepare('SELECT name FROM schools').get().name,'Sur')
    assert.equal(db.prepare('SELECT intensity FROM routines').get().intensity,'Media')
    db.prepare('INSERT INTO users(id,name,email,password,role,school) VALUES(?,?,?,?,?,?)').run('school','Dirección','colegio@test.cl','hash','school','Sur')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
    runInNewContext(initialization, { db })
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,2)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schools').get().n,1)
  } finally { db.close() }
})
