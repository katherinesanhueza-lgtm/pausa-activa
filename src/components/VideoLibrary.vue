<script setup>
import { computed, ref } from 'vue'
import { api } from '../services/api'
import AppIcon from './ui/AppIcon.vue'
import AppDialog from './ui/AppDialog.vue'
import VideoForm from './VideoForm.vue'
import ActivityForm from './ActivityForm.vue'
const props = defineProps({ videos: Array, user: Object, compact: Boolean })
const emit = defineEmits(['changed', 'notice'])
const search = ref('')
const category = ref('Todas')
const onlyMine = ref(false)
const adding = ref(false)
const playing = ref(null)
const recording = ref(null)
const removing = ref(null)
const busy = ref(false)
const error = ref('')
const categories = ['Todas', 'Movimiento', 'Baile', 'Respiración', 'Estiramientos']
const filtered = computed(() => {
  const items = props.videos.filter(v => (!onlyMine.value || v.teacher_id === props.user.id) && (category.value === 'Todas' || v.category === category.value) && `${v.title} ${v.teacher_name} ${v.description}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))
  return props.compact ? items.slice(0, 3) : items
})
const isEmbed = video => video.url?.startsWith('https://www.youtube-nocookie.com/embed/') || video.url?.startsWith('https://player.vimeo.com/video/')
const symbols = { Movimiento: '↗', Baile: '✳', Respiración: '≈', Estiramientos: '⌁' }
function saved() { adding.value = false; emit('changed'); emit('notice', 'Tu video ya está disponible para la escuela.') }
async function remove() {
  busy.value = true; error.value = ''
  try { await api(`/videos/${removing.value.id}`, { method: 'DELETE' }); removing.value = null; emit('changed'); emit('notice', 'Video eliminado.') }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <section>
    <div class="section-heading"><div><h2>{{ compact ? 'Últimas pausas compartidas' : 'Biblioteca de ejercicios' }}</h2><p class="muted">{{ compact ? 'Ideas de tu comunidad para darle energía al día.' : 'Un espacio para moverse, respirar y aprender juntos.' }}</p></div><button v-if="user.role === 'teacher'" class="button primary" @click="adding = true"><AppIcon name="plus" size="18" />Subir ejercicio</button></div>
    <div v-if="!compact" class="library-tools"><label class="search"><AppIcon name="search" size="18" /><input v-model="search" aria-label="Buscar videos" placeholder="Buscar videos o docentes…"></label><label v-if="user.role === 'teacher'" class="checkbox-label"><input v-model="onlyMine" type="checkbox">Solo mis videos</label></div>
    <div v-if="!compact" class="filters" role="group" aria-label="Filtrar por categoría"><button v-for="item in categories" :key="item" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div>
    <div class="video-grid">
      <article v-for="video in filtered" :key="video.id" class="video-card">
        <button :class="['video-cover', `cover-${categories.indexOf(video.category)}`]" :aria-label="`Reproducir ${video.title}`" @click="playing = video"><span class="cover-word">{{ video.category }}</span><span class="cover-symbol" aria-hidden="true">{{ symbols[video.category] }}</span><span class="play-circle"><AppIcon name="play" size="22" /></span><span class="cover-label"><AppIcon :name="video.filename ? 'upload' : 'link'" size="13" />{{ video.filename ? 'VIDEO DE LA ESCUELA' : 'VIDEO EN LÍNEA' }}</span></button>
        <div class="video-body"><span class="category-tag">{{ video.category }}</span><h3><button class="title-button" @click="playing = video">{{ video.title }}</button></h3><p class="video-description">{{ video.description || 'Un momento de bienestar para compartir en el aula.' }}</p><div class="video-author"><span class="mini-avatar">{{ video.teacher_name.slice(0, 1).toUpperCase() }}</span><span>{{ video.teacher_name }}</span><button v-if="video.teacher_id === user.id" class="icon-button danger" :aria-label="`Eliminar ${video.title}`" @click="removing = video; error = ''"><AppIcon name="trash" size="16" /></button></div></div>
      </article>
    </div>
    <div v-if="!filtered.length" class="empty panel"><AppIcon name="video" size="38" /><h3>{{ videos.length ? 'No hay videos con estos filtros' : 'Una pausa puede empezar contigo' }}</h3><p>{{ videos.length ? 'Prueba otra búsqueda o categoría.' : user.role === 'teacher' ? 'Comparte el primer video de pausa activa para tu comunidad.' : 'Cuando tus docentes publiquen videos, aparecerán aquí.' }}</p><button v-if="!videos.length && user.role === 'teacher'" class="button primary" @click="adding = true">Subir mi primer ejercicio</button></div>
    <ActivityForm v-if="recording" :video="recording" :school="user.school" @close="recording = null" @saved="recording = null; emit('changed'); emit('notice', 'Pausa registrada en tu resumen de actividad.')" />
    <VideoForm v-if="adding" @close="adding = false" @saved="saved" />
    <AppDialog v-if="playing" :title="playing.title" wide @close="playing = null"><iframe v-if="isEmbed(playing)" class="video-player" :src="playing.url" :title="playing.title" allow="fullscreen; picture-in-picture; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen /><video v-else class="video-player" :src="playing.filename ? `/api/videos/${playing.id}/file` : playing.url" controls playsinline preload="metadata" /><p class="muted">{{ playing.description }}</p><p class="small muted">Compartido por {{ playing.teacher_name }}</p><button v-if="user.role === 'teacher'" class="button primary" @click="recording = playing; playing = null"><AppIcon name="check" size="17" />Ya realicé esta pausa</button><p v-if="user.role === 'teacher'" class="field-hint">Al terminar, registra los minutos realizados para sumar una sesión a tu resumen.</p></AppDialog>
    <AppDialog v-if="removing" title="Eliminar video" :busy="busy" @close="removing = null"><p>¿Quieres eliminar <strong>{{ removing.title }}</strong>?</p><p class="muted">Ya no estará disponible en la biblioteca de la escuela.</p><p v-if="error" class="alert error" role="alert">{{ error }}</p><div class="modal-actions"><button class="button secondary" :disabled="busy" @click="removing = null">Cancelar</button><button class="button destructive" :disabled="busy" @click="remove">{{ busy ? 'Eliminando…' : 'Eliminar video' }}</button></div></AppDialog>
  </section>
</template>
