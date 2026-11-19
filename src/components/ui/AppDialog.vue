<script setup>
// Proporciona un diálogo reutilizable; bloquea el cierre mientras hay una operación en curso.
import { onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";
defineProps({ title: String, wide: Boolean, busy: Boolean });
// Eventos con los que este componente comunica acciones al padre.
const emit = defineEmits(["close"]);
// Referencia al elemento HTML dialog para abrirlo con su comportamiento modal nativo.
const dialog = ref(null);
// Ejecuta la inicialización cuando el componente ya está montado en la página.
onMounted(() => dialog.value.showModal());
</script>
<template>

  <dialog
    ref="dialog"
    :class="['modal', { wide }]"
    aria-labelledby="dialog-title"
    @cancel.prevent="!busy && emit('close')"
    @click="(event) => event.target === dialog && !busy && emit('close')"
  >
    <header class="modal-header">
      <h2 id="dialog-title">{{ title }}</h2>
      <button
        class="icon-button"
        aria-label="Cerrar"
        :disabled="busy"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
