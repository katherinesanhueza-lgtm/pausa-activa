<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api'
import AppDialog from './ui/AppDialog.vue'
const props = defineProps({ user: Object, videos: Array, mine: Boolean })
const routines = ref([]), search = ref(''), error = ref(''), busy = ref(false), loading = ref(true)
const draft = ref(null), viewing = ref(null), playing = ref(null), notice = ref('')
const schoolFilter=ref(''), courseFilter=ref(''), intensityFilter=ref('')
const schools=computed(() => [...new Set(routines.value.map(r=>r.school))])
const courses=computed(() => [...new Set(routines.value.map(r=>r.course).filter(Boolean))])
const filtered = computed(() => routines.value.filter(r => (props.mine ? r.teacher_id === props.user.id : (r.shared || props.user.role === 'admin')) && (!schoolFilter.value || r.school === schoolFilter.value) && (!courseFilter.value || r.course === courseFilter.value) && (!intensityFilter.value || r.intensity === intensityFilter.value) && `${r.title} ${r.description} ${r.teacher_name}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
const video = id => props.videos.find(v => v.id === id)
const total = r => r.sections.reduce((sum, s) => sum + s.exercises.reduce((n, e) => n + e.minutes, 0), 0)
const count = r => r.sections.reduce((sum, s) => sum + s.exercises.length, 0)
const embed = v => /https:\/\/(www.youtube-nocookie.com\/embed\/|player.vimeo.com\/video\/)/.test(v.url || '')
async function load() {
  loading.value = true; error.value = ''
  try { routines.value = (await api('/routines')).routines } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
function edit(r) {
  error.value = ''; notice.value = ''
  draft.value = r ? JSON.parse(JSON.stringify(r)) : { title: '', description: '', organization: 'Sesiones', course: '', intensity: 'Media', shared: false, sections: [{ name: 'Sesión 1', exercises: [] }] }
}
function copy(r) { edit(r); delete draft.value.id; draft.value.title = `${r.title.slice(0, 110)} (copia)`; draft.value.shared = false; viewing.value = null }
function move(items, index, offset) { const target = index + offset; if (target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]] }
async function save() {
  busy.value = true; error.value = ''
  try {
    await api(draft.value.id ? `/routines/${draft.value.id}` : '/routines', { method: draft.value.id ? 'PUT' : 'POST', body: draft.value })
    notice.value = draft.value.shared ? 'Rutina publicada en la comunidad.' : 'Rutina guardada en Mis rutinas.'
    draft.value = null; await load()
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section class="routine-space">
    <div class="community-banner"><span class="eyebrow">PROFESORES QUE INSPIRAN</span><h2>{{ mine ? 'Tu próxima pausa empieza aquí' : 'Las buenas ideas se comparten' }}</h2><p>{{ mine ? 'Arma tus rutinas y organiza cada momento de movimiento.' : 'Descubre rutinas de otros docentes y adáptalas a tu aula.' }}</p></div>
    <div class="section-heading"><div><h2>{{ mine ? 'Mis rutinas' : 'Muro de la comunidad' }}</h2><p class="muted">{{ mine ? 'Tus borradores y publicaciones, en un solo lugar.' : 'Rutinas compartidas por profesores · Más recientes primero' }}</p></div><button v-if="['teacher','admin'].includes(user.role)" class="button primary" @click="edit()">+ Crear rutina</button></div>
    <label class="search"><input v-model="search" aria-label="Buscar rutinas" placeholder="Buscar por rutina, descripción o profesor…"></label>
    <div class="report-filters panel"><label>Colegio<select v-model="schoolFilter"><option value="">Todos los colegios</option><option v-for="s in schools" :key="s">{{ s }}</option></select></label><label>Curso<select v-model="courseFilter"><option value="">Todos los cursos</option><option v-for="c in courses" :key="c">{{ c }}</option></select></label><label>Intensidad<select v-model="intensityFilter"><option value="">Todas las intensidades</option><option>Baja</option><option>Media</option><option>Alta</option></select></label></div>
    <p v-if="notice" class="alert success" role="status">{{ notice }}</p>
    <p v-if="error && !draft" class="alert error" role="alert">{{ error }} <button class="text-button" @click="load">Reintentar</button></p>
    <p v-if="loading" class="empty" role="status">Cargando rutinas…</p>
    <div v-else class="routine-feed">
      <article v-for="r in filtered" :key="r.id" class="panel routine-post">
        <div class="post-author"><span class="avatar">{{ r.teacher_name.slice(0, 2).toUpperCase() }}</span><div><strong>{{ r.teacher_name }}</strong><p class="muted small">{{ r.school }} · {{ r.shared ? 'Pública · Comunidad' : 'Privada' }}</p></div><span class="category-tag">{{ r.organization }}</span></div>
        <h3><button class="title-button" @click="viewing = r">{{ r.title }}</button></h3><p class="routine-description">{{ r.description || 'Una pausa para reconectar y movernos juntos.' }}</p>
        <div class="routine-summary"><span>{{ r.course || 'Todos los cursos' }}</span><span>Intensidad {{ r.intensity.toLowerCase() }}</span><span>{{ r.sections.length }} {{ r.organization.toLowerCase() }}</span><span>{{ count(r) }} ejercicios</span><span>{{ total(r) }} min</span></div>
        <div class="post-actions"><button class="button secondary" @click="viewing = r">Ver rutina</button><button v-if="(r.teacher_id === user.id || user.role === 'admin')" class="text-button" @click="edit(r)">Editar rutina</button><button v-else-if="['teacher','admin'].includes(user.role)" class="text-button" @click="copy(r)">Guardar una copia</button></div>
      </article>
      <div v-if="!filtered.length && !error" class="empty panel"><h3>{{ search ? 'Sin resultados' : mine ? 'Dale forma a tu primera rutina' : 'La comunidad empieza contigo' }}</h3><p>{{ search ? 'Prueba con otro nombre o profesor.' : 'Crea una rutina con ejercicios de la biblioteca y compártela con tus colegas.' }}</p></div>
    </div>
    <AppDialog v-if="draft" :title="draft.id ? 'Editar rutina' : 'Crear rutina'" wide :busy="busy" @close="draft = null; error = ''">
      <form @submit.prevent="save">
        <label>Nombre de la rutina<input v-model="draft.title" maxlength="120" required placeholder="Por ejemplo: Una semana con más energía"></label>
        <label>Descripción<textarea v-model="draft.description" rows="3" maxlength="2000" placeholder="Objetivo, recomendaciones y a quién está dirigida…" /></label>
        <label>Curso<input v-model="draft.course" maxlength="100" placeholder="Por ejemplo: 3° básico"></label><label>Intensidad<select v-model="draft.intensity"><option>Baja</option><option>Media</option><option>Alta</option></select></label><label>Organizar por<select v-model="draft.organization"><option>Sesiones</option><option>Bloques</option><option>Días</option></select></label>
        <div v-for="(section, index) in draft.sections" :key="index" class="routine-section panel">
          <label>Nombre de {{ draft.organization.toLowerCase() }}<input v-model="section.name" required maxlength="100" placeholder="Por ejemplo: Lunes · Activación"></label>
          <div class="section-controls"><button type="button" class="text-button" :disabled="index === 0" @click="move(draft.sections, index, -1)">↑ Subir</button><button type="button" class="text-button" :disabled="index === draft.sections.length - 1" @click="move(draft.sections, index, 1)">↓ Bajar</button><button type="button" class="text-button danger" :disabled="draft.sections.length === 1" @click="draft.sections.splice(index, 1)">Quitar sección</button></div>
          <div v-for="(exercise, n) in section.exercises" :key="n" class="exercise-edit">
            <label>Ejercicio {{ n + 1 }}<select v-model="exercise.video_id" required><option disabled value="">Selecciona un ejercicio</option><option v-for="v in videos" :key="v.id" :value="v.id">{{ v.title }} · {{ v.teacher_name }}</option></select></label>
            <label>Minutos<input v-model.number="exercise.minutes" type="number" min="1" max="180" required></label>
            <div class="section-controls"><button type="button" class="text-button" :disabled="n === 0" @click="move(section.exercises, n, -1)" aria-label="Subir ejercicio">↑</button><button type="button" class="text-button" :disabled="n === section.exercises.length - 1" @click="move(section.exercises, n, 1)" aria-label="Bajar ejercicio">↓</button><button type="button" class="text-button danger" @click="section.exercises.splice(n, 1)">Quitar</button></div>
          </div>
          <button type="button" class="text-button" :disabled="!videos.length || section.exercises.length >= 30" @click="section.exercises.push({ video_id: '', minutes: 3 })">+ Agregar ejercicio</button>
        </div>
        <p v-if="!videos.length" class="alert">Primero sube un ejercicio en la Biblioteca de ejercicios.</p>
        <button type="button" class="button secondary" :disabled="draft.sections.length >= 20" @click="draft.sections.push({ name: '', exercises: [] })">+ Agregar sección</button>
        <label class="checkbox-label"><input v-model="draft.shared" type="checkbox">Compartir con todos los profesores de la comunidad</label><p class="field-hint">Si no la compartes, será privada. La administración también puede consultarla. Cada profesor puede guardar y adaptar su propia copia.</p>
        <p v-if="error" class="alert error" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button secondary" :disabled="busy" @click="draft = null; error = ''">Cancelar</button><button class="button primary" :disabled="busy || !videos.length">{{ busy ? 'Guardando…' : draft.shared ? 'Guardar y compartir' : 'Guardar rutina' }}</button></div>
      </form>
    </AppDialog>
    <AppDialog v-if="viewing" :title="viewing.title" wide @close="viewing = null; playing = null">
      <p class="muted">Por {{ viewing.teacher_name }} · {{ total(viewing) }} minutos</p><p class="routine-description">{{ viewing.description }}</p>
      <div v-for="(section, i) in viewing.sections" :key="i" class="routine-section panel"><h3>{{ section.name }}</h3><div v-for="(exercise, n) in section.exercises" :key="n" class="routine-exercise"><span class="mini-avatar">{{ n + 1 }}</span><div><strong>{{ video(exercise.video_id)?.title || 'Ejercicio no disponible' }}</strong><p class="muted small">{{ video(exercise.video_id)?.description }}</p></div><span>{{ exercise.minutes }} min</span><button v-if="video(exercise.video_id)" class="text-button" @click="playing = video(exercise.video_id)">Ver video</button></div></div>
      <template v-if="playing"><h3>{{ playing.title }}</h3><iframe v-if="embed(playing)" class="video-player" :src="playing.url" :title="playing.title" allowfullscreen /><video v-else class="video-player" :src="playing.filename ? `/api/videos/${playing.id}/file` : playing.url" controls playsinline /></template>
      <div class="modal-actions"><button v-if="viewing.teacher_id !== user.id && ['teacher','admin'].includes(user.role)" class="button primary" @click="copy(viewing)">Guardar y adaptar una copia</button></div>
    </AppDialog>
  </section>
</template>
