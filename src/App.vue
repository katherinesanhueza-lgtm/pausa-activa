<script setup>
// Coordina el arranque: comprueba la configuración y la sesión para mostrar el acceso o el panel.
import { onMounted, onUnmounted, ref } from "vue";
import AuthView from "./views/AuthView.vue";
import DashboardView from "./views/DashboardView.vue";
import { api } from "./services/api";
const user = ref(null);
const setup = ref(false);
const loading = ref(true);
const error = ref("");
// Consulta si falta la configuración inicial e intenta recuperar el usuario de la sesión.
async function load() {
  loading.value = true;
  error.value = "";
  try {
    setup.value = (await api("/setup")).required;
    if (!setup.value) {
      try {
        user.value = (await api("/me")).user;
      } catch {
        user.value = null;
      }
    }
  } catch {
    error.value =
      "No podemos conectar con la escuela. Comprueba que el servidor esté en ejecución e inténtalo de nuevo.";
  } finally {
    loading.value = false;
  }
}
// Actualiza la sesión de la interfaz tras un acceso o configuración correctos.
function authenticated(value) {
  user.value = value;
  setup.value = false;
}
// Vuelve a la pantalla de acceso cuando la API informa que la sesión caducó.
function expired() {
  user.value = null;
}
// Ejecuta la inicialización cuando el componente ya está montado en la página.
onMounted(() => {
  load();
  window.addEventListener("session-expired", expired);
});
// Retira los recursos o escuchas al abandonar este componente.
onUnmounted(() => window.removeEventListener("session-expired", expired));
</script>
<template>

  <div v-if="loading" class="loading-screen" role="status">
    <span class="loading-dot" />Preparando tu espacio…
  </div>
  <div v-else-if="error" class="loading-screen">
    <p role="alert">{{ error }}</p>
    <button class="button primary" @click="load">Reintentar</button>
  </div>
  <DashboardView v-else-if="user" :user="user" @logout="user = null" />
  <AuthView v-else :setup="setup" @authenticated="authenticated" />
</template>
