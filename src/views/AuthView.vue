<script setup>
import { reactive, ref } from 'vue'
import { api } from '../services/api'
import AppIcon from '../components/ui/AppIcon.vue'
const props = defineProps({ setup: Boolean })
const emit = defineEmits(['authenticated'])
const form = reactive({ school: '', name: '', email: '', password: '' })
const busy = ref(false)
const error = ref('')
async function submit() {
  busy.value = true; error.value = ''
  try { const data = await api(props.setup ? '/setup' : '/login', { method: 'POST', body: form }); emit('authenticated', data.user) }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
</script>
<template>
  <div class="auth-page">
    <section class="auth-story">
      <a href="/" class="brand"><span class="brand-symbol"><AppIcon name="leaf" size="26" /></span>pausa<span class="brand-light">activa</span></a>
      <div class="auth-message"><span class="pill"><AppIcon name="school" size="15" /> BIENESTAR EN LA ESCUELA</span><h1>Pequeñas pausas.<br><em>Grandes cambios.</em></h1><p>Un espacio para que tu comunidad educativa se mueva, respire y recargue energías.</p><div class="auth-art" aria-hidden="true"><span>✳</span><span>↗</span><span>≈</span></div></div>
      <p class="auth-bottom">Más movimiento. Más conexión. Más bienestar.</p>
    </section>
    <section class="auth-form-wrap">
      <div class="auth-form">
        <p class="eyebrow">{{ setup ? 'COMENCEMOS' : 'TU COMUNIDAD, CONECTADA' }}</p>
        <h2>{{ setup ? 'Configura tu escuela' : 'Te damos la bienvenida' }}</h2>
        <p class="muted">{{ setup ? 'Crea la cuenta de administrador para incorporar a tus docentes.' : 'Ingresa con tu cuenta de administrador o docente.' }}</p>
        <form @submit.prevent="submit">
          <label v-if="setup">Nombre de la escuela<input v-model="form.school" required maxlength="150" autocomplete="organization" placeholder="Ej. Escuela Los Aromos"></label>
          <label v-if="setup">Tu nombre<input v-model="form.name" required maxlength="100" autocomplete="name" placeholder="Nombre y apellido"></label>
          <label>Correo electrónico<input v-model="form.email" type="email" required maxlength="200" autocomplete="username" placeholder="nombre@escuela.cl"></label>
          <label>Contraseña<input v-model="form.password" type="password" required :minlength="setup ? 8 : 1" maxlength="128" :autocomplete="setup ? 'new-password' : 'current-password'" :placeholder="setup ? 'Mínimo 8 caracteres' : 'Tu contraseña'"></label>
          <p v-if="error" class="alert error" role="alert">{{ error }}</p>
          <button class="button primary full" :disabled="busy">{{ busy ? 'Un momento…' : setup ? 'Crear mi escuela' : 'Iniciar sesión' }}<AppIcon name="arrow" size="18" /></button>
        </form>
        <p class="auth-note"><AppIcon name="shield" size="17" />{{ setup ? 'Serás responsable de gestionar el acceso de los docentes.' : 'Si eres docente, solicita tu cuenta al administrador de tu escuela.' }}</p>
      </div>
    </section>
  </div>
</template>
