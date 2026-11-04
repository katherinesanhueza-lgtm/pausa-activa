<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api'
import AppIcon from '../components/ui/AppIcon.vue'
import InstitutionManager from '../components/InstitutionManager.vue'
import TeacherManager from '../components/TeacherManager.vue'
import ActivityDashboard from '../components/ActivityDashboard.vue'
import VideoLibrary from '../components/VideoLibrary.vue'
import RoutineCommunity from '../components/RoutineCommunity.vue'
const props = defineProps({ user: Object })
const emit = defineEmits(['logout'])
const page = ref('community')
const teachers = ref([])
const videos = ref([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const loggingOut = ref(false)
const refreshKey = ref(0)
const manager = computed(() => props.user.role !== 'teacher')
const roleLabel = computed(() => ({ admin:'Administrador', school:'Colegio', teacher:'Docente' })[props.user.role])
const admin = computed(() => props.user.role === 'admin')

const nav = computed(() => [{ id: 'community', label: 'Comunidad', icon: 'users' }, { id: 'routines', label: 'Mis rutinas', icon: 'leaf' }, { id: 'home', label: 'Resumen', icon: 'home' }, ...(admin.value ? [{ id:'institutions', label:'Colegios y usuarios', icon:'school' }] : []), ...(manager.value ? [{ id: 'teachers', label: 'Docentes', icon: 'users' }] : []), { id: 'reports', label: manager.value ? 'Reportes por institución' : 'Mi actividad', icon: 'clock' }, { id: 'videos', label: 'Biblioteca de ejercicios', icon: 'video' }])
const pageTitle = computed(() => nav.value.find(item => item.id === page.value)?.label)
async function load() {
  error.value = ''
  try {
    const result = await Promise.all([api('/videos'), ...(manager.value ? [api('/teachers')] : [])])
    videos.value = result[0].videos
    if (manager.value) teachers.value = result[1].teachers
    refreshKey.value++
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
async function logout() {
  loggingOut.value = true
  try { await api('/logout', { method: 'POST' }); emit('logout') }
  catch (e) { error.value = e.message } finally { loggingOut.value = false }
}
function navigate(id) { page.value = id; notice.value = '' }
onMounted(load)
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a href="#" class="brand" @click.prevent="navigate('home')"><span class="brand-symbol"><AppIcon name="leaf" size="24" /></span>pausa<span class="brand-light">activa</span></a>
      <div class="school-identity"><span class="school-icon"><AppIcon name="school" /></span><div><strong>{{ admin ? 'Gestión de instituciones' : user.school }}</strong><span>Comunidad educativa</span></div></div>
      <p class="nav-label">MI ESPACIO</p>
      <nav aria-label="Navegación principal"><button v-for="item in nav" :key="item.id" :class="['nav-item', { active: page === item.id }]" :aria-current="page === item.id ? 'page' : undefined" @click="navigate(item.id)"><AppIcon :name="item.icon" size="19" />{{ item.label }}<span v-if="item.id === 'teachers'" class="nav-count">{{ teachers.length }}</span></button></nav>
      <div class="sidebar-note"><span aria-hidden="true">✳</span><strong>Una pausa hace bien.</strong><p>Unos minutos para reconectar pueden cambiar el día.</p></div>
      <div class="sidebar-account"><span class="avatar">{{ user.name.slice(0, 2).toUpperCase() }}</span><div><strong>{{ user.name }}</strong><span>{{ roleLabel }}</span></div><button class="icon-button" :disabled="loggingOut" aria-label="Cerrar sesión" title="Cerrar sesión" @click="logout"><AppIcon name="logout" size="18" /></button></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">Mi escuela <span>/</span> <strong>{{ pageTitle }}</strong></div><span class="profile-tag"><AppIcon :name="admin ? 'shield' : 'users'" size="15" />{{ roleLabel }}</span></header>
      <main class="main-content" id="contenido">
        <Transition name="section-page" mode="out-in" appear>
          <div :key="page" class="section-page">
        <div class="page-intro"><p class="eyebrow">UN ESPACIO PARA EL BIENESTAR</p><h1>{{ page === 'community' ? 'En movimiento, en comunidad' : page === 'routines' ? 'Rutinas que inspiran bienestar' : page === 'home' ? `Hola, ${user.name.split(' ')[0]}` : page === 'institutions' ? 'Colegios y usuarios' : page === 'teachers' ? 'Tu equipo, en movimiento' : page === 'reports' ? (manager ? 'El bienestar, en cifras' : 'Cada pausa suma') : 'Una pausa para cada momento' }}<span v-if="page === 'home'" class="greeting-dot">.</span></h1><p class="muted">{{ page === 'community' ? 'Un espacio para descubrir, crear y compartir entre profesores.' : page === 'routines' ? 'Crea y organiza tus ejercicios por sesiones, bloques o días.' : page === 'home' ? 'Cada pausa cuenta. Construyamos una escuela con más energía y conexión.' : page === 'teachers' ? 'Acompaña a quienes hacen del bienestar una parte del aula.' : page === 'reports' ? 'Consulta los minutos y sesiones realizados en el período que elijas.' : 'Descubre y comparte videos de pausa activa para tu escuela.' }}</p></div>
        <div v-if="notice" class="alert success notice" role="status"><AppIcon name="check" size="19" />{{ notice }}<button class="icon-button" aria-label="Cerrar aviso" @click="notice = ''"><AppIcon name="close" size="16" /></button></div>
        <div v-if="error" class="alert error" role="alert">{{ error }} <button class="text-button" @click="load">Reintentar</button></div>
        <div v-if="loading" class="empty" role="status">Cargando tu comunidad…</div>
        <template v-else>
          <RoutineCommunity v-if="page === 'community' || page === 'routines'" :key="page" :user="user" :videos="videos" :mine="page === 'routines'" />
          <template v-if="page === 'home'">
            <ActivityDashboard :user="user" :refresh-key="refreshKey" @changed="load" @notice="notice = $event" />
            <VideoLibrary :videos="videos" :user="user" compact @changed="load" @notice="notice = $event" />
            <button v-if="videos.length > 3" class="text-button all-videos" @click="navigate('videos')">Ver toda la biblioteca <AppIcon name="arrow" size="16" /></button>
          </template>
          <ActivityDashboard v-if="page === 'reports'" :user="user" :refresh-key="refreshKey" @changed="load" @notice="notice = $event" />
          <InstitutionManager v-if="page === 'institutions' && admin" />
          <TeacherManager v-if="page === 'teachers' && manager" :teachers="teachers" :school="user.school" :readonly="!admin" @changed="load" @notice="notice = $event" />
          <VideoLibrary v-if="page === 'videos'" :videos="videos" :user="user" @changed="load" @notice="notice = $event" />
        </template>
          </div>
        </Transition>
        <footer class="workspace-footer"><span>pausa activa · Bienestar en comunidad</span><span>Hecho para tu escuela <AppIcon name="leaf" size="14" /></span></footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.section-page { min-width: 0; }
.section-page-enter-active {
  transition: opacity 260ms ease-out, transform 260ms ease-out;
}
.section-page-leave-active {
  transition: opacity 120ms ease-in, transform 120ms ease-in;
}
.section-page-enter-from { opacity: 0; transform: translateY(10px); }
.section-page-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .section-page-enter-active, .section-page-leave-active { transition: none; }
  .section-page-enter-from, .section-page-leave-to { transform: none; }
}
</style>
