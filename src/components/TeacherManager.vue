<script setup>
import { computed, reactive, ref } from 'vue'
import { api } from '../services/api'
import AppIcon from './ui/AppIcon.vue'
import AppDialog from './ui/AppDialog.vue'
const props = defineProps({ teachers: Array, school: String, readonly: Boolean })
const emit = defineEmits(['changed', 'notice'])
const search = ref('')
const adding = ref(false)
const editing = ref(null)
const removing = ref(null)
const busy = ref(false)
const error = ref('')
const form = reactive({ name: '', email: '', password: '', school: '' })
const filtered = computed(() => props.teachers.filter(t => `${t.name} ${t.email} ${t.school}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
const schools = computed(() => [...new Set([props.school, ...props.teachers.map(t => t.school)])].filter(Boolean))
function open(teacher = null) { editing.value = teacher; Object.assign(form, { name: teacher?.name || '', email: teacher?.email || '', password: '', school: teacher?.school || props.school || '' }); error.value = ''; adding.value = true }
async function save() {
  busy.value = true; error.value = ''
  try { await api(editing.value ? `/teachers/${editing.value.id}` : '/teachers', { method: editing.value ? 'PATCH' : 'POST', body: form }); adding.value = false; emit('changed'); emit('notice', editing.value ? 'Datos del docente actualizados. Las pausas anteriores conservan su colegio original.' : 'Docente agregado. Ya puede ingresar con su correo y contraseña.') }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
async function remove() {
  busy.value = true; error.value = ''
  try { await api(`/teachers/${removing.value.id}`, { method: 'DELETE' }); removing.value = null; emit('changed'); emit('notice', 'El docente y sus videos fueron eliminados.') }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <section>
    <div class="section-heading"><div><h2>Equipo docente <span class="count">{{ teachers.length }}</span></h2><p class="muted">Gestiona quiénes pueden compartir pausas en tu escuela.</p></div><button v-if="!readonly" class="button primary" @click="open()"><AppIcon name="plus" size="18" />Agregar docente</button></div>
    <div class="panel">
      <div class="table-toolbar"><label class="search"><AppIcon name="search" size="18" /><input v-model="search" aria-label="Buscar docentes" placeholder="Buscar por nombre, correo o colegio…"></label><span class="muted small">{{ filtered.length }} docentes · Totales históricos</span></div>
      <div class="table-scroll"><table><thead><tr><th>Docente</th><th>Colegio</th><th>Minutos de pausa</th><th>Sesiones realizadas</th><th>Videos</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody><tr v-for="teacher in filtered" :key="teacher.id"><td><div class="person"><span class="avatar">{{ teacher.name.slice(0, 2).toUpperCase() }}</span><div><strong>{{ teacher.name }}</strong><span class="muted small">{{ teacher.email }}</span></div></div></td><td>{{ teacher.school }}</td><td>{{ teacher.minutes }} min</td><td>{{ teacher.session_count }}</td><td>{{ teacher.video_count }}</td><td v-if="!readonly"><button class="icon-button" :aria-label="`Editar a ${teacher.name}`" @click="open(teacher)"><AppIcon name="school" size="18" /></button><button class="icon-button danger" :aria-label="`Eliminar a ${teacher.name}`" @click="removing = teacher; error = ''"><AppIcon name="trash" size="18" /></button></td></tr></tbody></table></div>
      <div v-if="!filtered.length" class="empty"><AppIcon name="users" size="36" /><h3>{{ teachers.length ? 'No encontramos docentes' : 'Tu equipo comienza aquí' }}</h3><p>{{ teachers.length ? 'Prueba con otro nombre o correo.' : 'Agrega al primer docente para comenzar a compartir videos.' }}</p><button v-if="!teachers.length && !readonly" class="button secondary" @click="open()">Agregar primer docente</button></div>
    </div>
    <AppDialog v-if="adding" :title="editing ? 'Editar docente' : 'Agregar docente'" :busy="busy" @close="adding = false"><p class="muted">{{ editing ? 'Actualiza su nombre y colegio. Los registros anteriores conservan la institución donde se realizaron.' : 'Crea su acceso y asigna el colegio al que pertenece.' }}</p><form @submit.prevent="save"><label>Nombre y apellido<input v-model="form.name" required maxlength="100" autocomplete="off" placeholder="Ej. Camila González"></label><label>Colegio<input v-model="form.school" required maxlength="150" list="teacher-schools" placeholder="Nombre del colegio"></label><datalist id="teacher-schools"><option v-for="item in schools" :key="item" :value="item" /></datalist><label v-if="!editing">Correo electrónico<input v-model="form.email" type="email" required maxlength="200" autocomplete="off" placeholder="docente@escuela.cl"></label><label v-if="!editing">Contraseña de acceso<input v-model="form.password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label><p v-if="error" class="alert error" role="alert">{{ error }}</p><div class="modal-actions"><button type="button" class="button secondary" :disabled="busy" @click="adding = false">Cancelar</button><button class="button primary" :disabled="busy">{{ busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear docente' }}</button></div></form></AppDialog>
    <AppDialog v-if="removing" title="Eliminar docente" :busy="busy" @close="removing = null"><p>¿Quieres eliminar a <strong>{{ removing.name }}</strong>?</p><p class="muted">Se eliminarán su acceso y sus {{ removing.video_count }} videos. Sus pausas realizadas se conservarán en los reportes históricos. Esta acción no se puede deshacer.</p><p v-if="error" class="alert error" role="alert">{{ error }}</p><div class="modal-actions"><button class="button secondary" :disabled="busy" @click="removing = null">Cancelar</button><button class="button destructive" :disabled="busy" @click="remove">{{ busy ? 'Eliminando…' : 'Eliminar docente' }}</button></div></AppDialog>
  </section>
</template>
