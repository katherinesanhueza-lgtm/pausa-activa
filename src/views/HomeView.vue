<script setup>
import { ref } from 'vue'
import ActivityCard from '../components/ActivityCard.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { activities } from '../data/activities'
import { useTimer } from '../composables/useTimer'
const selected = ref(activities[0])
const { remaining, running, formatted, start, pause, reset } = useTimer(selected.value.duration)
function selectActivity(activity) { selected.value = activity; reset(activity.duration) }
</script>
<template>
  <div class="container">
    <section class="hero">
      <div><p class="eyebrow">RESPIRA. MUÉVETE. RECONECTA.</p><h1>Haz una pausa.<br><span>Vuelve con energía.</span></h1><p class="description">Regálate unos minutos en medio del día. Elige tu pausa y encuentra un momento para ti.</p><a class="text-link" href="#actividades">Encuentra tu próxima pausa ↓</a></div>
      <aside class="timer-panel" aria-label="Temporizador de pausa"><span class="badge">{{ selected.title }}</span><p class="timer" role="timer" :aria-label="`${remaining} segundos restantes`">{{ formatted }}</p><p role="status">{{ remaining === 0 ? '¡Pausa completada!' : running ? 'Este momento es para ti.' : 'Todo comienza con una pausa.' }}</p><div class="actions"><BaseButton :disabled="remaining === 0" @click="running ? pause() : start()">{{ running ? 'Pausar' : 'Comenzar' }}</BaseButton><BaseButton variant="secondary" @click="reset(selected.duration)">Reiniciar</BaseButton></div></aside>
    </section>
    <section id="actividades" class="activities"><p class="eyebrow">A TU RITMO</p><h2>¿Qué necesitas hoy?</h2><div class="grid"><ActivityCard v-for="activity in activities" :key="activity.id" :activity="activity" @select="selectActivity" /></div></section>
  </div>
</template>
