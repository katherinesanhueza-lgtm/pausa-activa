<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../services/api'
const schools = ref([]), users = ref([]), error = ref(''), notice = ref(''), busy = ref(false)
const schoolName = ref('')
const form = ref({ name: '', email: '', password: '', school: '', role: 'teacher' })
const roles = { teacher: 'Docente', school: 'Colegio', admin: 'Administrador' }
async function load() {
  try { const [s,u] = await Promise.all([api('/schools'), api('/users')]); schools.value=s.schools; users.value=u.users }
  catch(e) { error.value=e.message }
}
async function save(kind) {
  busy.value=true; error.value=''; notice.value=''
  try {
    await api(kind === 'school' ? '/schools' : '/users', { method:'POST', body: kind === 'school' ? { name:schoolName.value } : form.value })
    notice.value=kind === 'school' ? 'Colegio creado.' : 'Usuario creado. Ya puede iniciar sesión con su correo y contraseña.'
    if(kind === 'school') schoolName.value=''
    else form.value={ name:'', email:'', password:'', school:'', role:'teacher' }
    await load()
  } catch(e) { error.value=e.message } finally { busy.value=false }
}
onMounted(load)
</script>
<template>
<section>
  <p v-if="error" class="alert error" role="alert">{{ error }}</p>
  <p v-if="notice" class="alert success" role="status">{{ notice }}</p>
  <div class="panel routine-section"><h2>Colegios</h2>
    <form @submit.prevent="save('school')"><label>Nombre del colegio<input v-model="schoolName" required maxlength="150"></label><button class="button primary" :disabled="busy">Crear colegio</button></form>
    <ul><li v-for="s in schools" :key="s.id">{{ s.name }}</li></ul>
  </div>
  <div class="panel routine-section"><h2>Crear usuario</h2><form @submit.prevent="save('user')">
    <label>Perfil<select v-model="form.role"><option v-for="(label,key) in roles" :key="key" :value="key">{{ label }}</option></select></label>
    <label>Nombre<input v-model="form.name" required maxlength="100"></label>
    <label>Correo<input v-model="form.email" type="email" required maxlength="200" autocomplete="off"></label>
    <label>Contraseña<input v-model="form.password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
    <label>Colegio<select v-model="form.school" required><option disabled value="">Selecciona un colegio</option><option v-for="s in schools" :key="s.id" :value="s.name">{{ s.name }}</option></select></label>
    <button class="button primary" :disabled="busy">Crear usuario</button>
  </form></div>
  <div class="panel table-scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Colegio</th></tr></thead><tbody><tr v-for="u in users" :key="u.id"><td>{{ u.name }}</td><td>{{ u.email }}</td><td>{{ roles[u.role] }}</td><td>{{ u.school }}</td></tr></tbody></table></div>
</section>
</template>
