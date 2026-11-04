<script setup>
import { reactive, ref } from 'vue'
import { api } from '../services/api'
import AppDialog from './ui/AppDialog.vue'
const props = defineProps({ video: Object, school: String })
const emit = defineEmits(['close', 'saved'])
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const form = reactive({ id: crypto.randomUUID(), minutes: 5, performed_on: today, video_id: props.video?.id || null })
const busy = ref(false)
const error = ref('')
async function save() {
  busy.value = true; error.value = ''
  try { await api('/activity', { method: 'POST', body: form }); emit('saved') }
  catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>
<template>
  <AppDialog title="Registrar pausa realizada" :busy="busy" @close="emit('close')">
    <p class="muted">Registra una sesión que ya realizaste. Cada registro suma una sesión a tu resumen y al de <strong>{{ school }}</strong>.</p>
    <p v-if="video" class="activity-video-note">Video: {{ video.title }}</p>
    <form @submit.prevent="save"><label>Minutos realizados<input v-model.number="form.minutes" type="number" min="1" max="180" step="1" required><span class="field-hint">Duración real de la pausa, entre 1 y 180 minutos.</span></label><label>Fecha de la pausa<input v-model="form.performed_on" type="date" min="2000-01-01" :max="today" required></label><p class="field-hint">Este es un registro declarado por ti. La reproducción de un video no agrega minutos automáticamente.</p><p v-if="error" class="alert error" role="alert">{{ error }}</p><div class="modal-actions"><button type="button" class="button secondary" :disabled="busy" @click="emit('close')">Cancelar</button><button class="button primary" :disabled="busy">{{ busy ? 'Registrando…' : 'Guardar sesión realizada' }}</button></div></form>
  </AppDialog>
</template>
