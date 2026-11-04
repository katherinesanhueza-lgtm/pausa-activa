<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import AuthView from './views/AuthView.vue'
import DashboardView from './views/DashboardView.vue'
import { api } from './services/api'
const user = ref(null)
const setup = ref(false)
const loading = ref(true)
const error = ref('')
async function load() {
  loading.value = true; error.value = ''
  try {
    setup.value = (await api('/setup')).required
    if (!setup.value) { try { user.value = (await api('/me')).user } catch { user.value = null } }
  } catch { error.value = 'No podemos conectar con la escuela. Comprueba que el servidor esté en ejecución e inténtalo de nuevo.' }
  finally { loading.value = false }
}
function authenticated(value) { user.value = value; setup.value = false }
function expired() { user.value = null }
onMounted(() => { load(); window.addEventListener('session-expired', expired) })
onUnmounted(() => window.removeEventListener('session-expired', expired))
</script>
<template>
  <div v-if="loading" class="loading-screen" role="status"><span class="loading-dot" />Preparando tu espacio…</div>
  <div v-else-if="error" class="loading-screen"><p role="alert">{{ error }}</p><button class="button primary" @click="load">Reintentar</button></div>
  <DashboardView v-else-if="user" :user="user" @logout="user = null" />
  <AuthView v-else :setup="setup" @authenticated="authenticated" />
</template>
