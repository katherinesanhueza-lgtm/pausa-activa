<script setup>
import BaseButton from './ui/BaseButton.vue'
defineProps({ activity: { type: Object, required: true } })
defineEmits(['select'])
</script>
<template><article class="card"><span class="icon" aria-hidden="true">{{ activity.icon }}</span><p class="eyebrow">{{ activity.duration / 60 }} MINUTOS</p><h3>{{ activity.title }}</h3><p>{{ activity.description }}</p><BaseButton variant="secondary" @click="$emit('select', activity)">Elegir pausa ↗</BaseButton></article></template>
