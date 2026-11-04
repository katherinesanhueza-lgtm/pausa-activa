<script setup>
import { reactive, ref } from 'vue'
import { api } from '../services/api'
import AppDialog from './ui/AppDialog.vue'
import AppIcon from './ui/AppIcon.vue'
const emit = defineEmits(['close', 'saved'])
const form = reactive({ title: '', description: '', category: 'Movimiento', url: '' })
const mode = ref('link')
const file = ref(null)
const busy = ref(false)
const error = ref('')
function select(event) { file.value = event.target.files[0] || null }
async function save() {
  busy.value = true; error.value = ''
  try {
    if (mode.value === 'file') {
      if (!file.value) throw new Error('Selecciona un video.')
      if (file.value.size > 100 * 1024 * 1024) throw new Error('El video supera el máximo de 100 MB.')
      if (!['video/mp4', 'video/webm'].includes(file.value.type)) throw new Error('Usa un archivo MP4 o WebM.')
      const params = new URLSearchParams({ title: form.title, description: form.description, category: form.category })
      await api(`/videos/upload?${params}`, { method: 'POST', body: file.value, headers: { 'Content-Type': file.value.type } })
    } else { await api('/videos', { method: 'POST', body: form }) }
    emit('saved')
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <AppDialog title="Agregar video de pausa activa" :busy="busy" @close="emit('close')">
    <p class="muted">Comparte una nueva idea para poner a tu escuela en movimiento.</p>
    <form @submit.prevent="save">
      <label>Título del video<input v-model="form.title" required maxlength="120" placeholder="Ej. Una pausa para bailar"></label>
      <div class="mode-switch" role="group" aria-label="Origen del video"><button type="button" :aria-pressed="mode === 'link'" :class="{ active: mode === 'link' }" :disabled="busy" @click="mode = 'link'"><AppIcon name="link" size="17" />Pegar enlace</button><button type="button" :aria-pressed="mode === 'file'" :class="{ active: mode === 'file' }" :disabled="busy" @click="mode = 'file'"><AppIcon name="upload" size="17" />Subir archivo</button></div>
      <label v-if="mode === 'link'">Enlace del video<input v-model="form.url" type="url" required maxlength="2000" placeholder="https://www.youtube.com/watch?v=…"><span class="field-hint">YouTube, Vimeo o un enlace directo a MP4/WebM. Algunos autores restringen la reproducción en otras páginas.</span></label>
      <label v-else class="file-field"><AppIcon name="upload" size="28" /><strong>{{ file ? file.name : 'Selecciona tu video' }}</strong><span class="field-hint">MP4 o WebM · Máximo 100 MB</span><input type="file" accept="video/mp4,video/webm" required @change="select"></label>
      <label>Categoría<select v-model="form.category"><option>Movimiento</option><option>Baile</option><option>Respiración</option><option>Estiramientos</option></select></label>
      <label>Descripción <span class="optional">(opcional)</span><textarea v-model="form.description" maxlength="1000" rows="3" placeholder="Cuéntanos de qué trata esta pausa…" /></label>
      <p v-if="error" class="alert error" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button secondary" :disabled="busy" @click="emit('close')">Cancelar</button><button class="button primary" :disabled="busy"><AppIcon name="plus" size="17" />{{ busy ? 'Guardando video…' : 'Publicar video' }}</button></div>
    </form>
  </AppDialog>
</template>
