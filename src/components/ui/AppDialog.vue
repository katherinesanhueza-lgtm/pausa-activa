<script setup>
import { onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
defineProps({ title: String, wide: Boolean, busy: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
onMounted(() => dialog.value.showModal())
</script>
<template>
  <dialog ref="dialog" :class="['modal', { wide }]" aria-labelledby="dialog-title" @cancel.prevent="!busy && emit('close')" @click="event => event.target === dialog && !busy && emit('close')">
    <header class="modal-header"><h2 id="dialog-title">{{ title }}</h2><button class="icon-button" aria-label="Cerrar" :disabled="busy" @click="emit('close')"><AppIcon name="close" /></button></header>
    <slot />
  </dialog>
</template>
