<script setup>
defineProps({ variant: { type: String, default: 'primary' } })
</script>
<template><button type="button" :class="['button', variant]"><slot /></button></template>
