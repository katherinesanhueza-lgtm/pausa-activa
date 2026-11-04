<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../services/api'
import AppIcon from './ui/AppIcon.vue'
import ActivityForm from './ActivityForm.vue'
const props = defineProps({ user: Object, refreshKey: Number })
const emit = defineEmits(['changed', 'notice'])
const admin = computed(() => props.user.role !== 'teacher')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const from = ref(today.slice(0, 8) + '01')
const to = ref(today)
const school = ref('')
const report = ref(null)
const busy = ref(false)
const error = ref('')
const adding = ref(false)
const maxMinutes = computed(() => Math.max(1, ...(report.value?.institutions || []).map(s => s.minutes)))
const number = value => new Intl.NumberFormat('es-CL').format(value || 0)
const date = value => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(value + 'T12:00:00Z'))
let revision = 0
async function load() {
  const current = ++revision
  busy.value = true; error.value = ''
  try {
    const params = new URLSearchParams({ from: from.value, to: to.value, school: school.value })
    const data = await api(`/reports?${params}`)
    if (current === revision) report.value = data
  } catch (e) { if (current === revision) { error.value = e.message; report.value = null } }
  finally { if (current === revision) busy.value = false }
}
function saved() { adding.value = false; load(); emit('changed'); emit('notice', 'Pausa registrada. Tus minutos y sesiones ya están actualizados.') }
watch(() => props.refreshKey, load)
onMounted(load)
</script>
<template>
  <section class="activity-dashboard">
    <div class="section-heading"><div><h2>{{ admin ? 'Reporte de pausas por institución' : 'Mi actividad de pausa activa' }}</h2><p class="muted">{{ admin ? 'Minutos y sesiones declarados por los docentes de cada colegio.' : `Tus sesiones y minutos realizados · ${user.school}` }}</p></div><button v-if="user.role === 'teacher'" class="button primary" @click="adding = true"><AppIcon name="plus" size="17" />Registrar pausa realizada</button></div>
    <form class="report-filters panel" @submit.prevent="load"><label>Desde<input v-model="from" type="date" min="2000-01-01" :max="to || today" required></label><label>Hasta<input v-model="to" type="date" :min="from" :max="today" required></label><label v-if="admin">Institución<select v-model="school"><option value="">Todos los colegios</option><option v-for="item in report?.schools || []" :key="item" :value="item">{{ item }}</option></select></label><button class="button secondary" :disabled="busy">{{ busy ? 'Consultando…' : 'Aplicar filtros' }}</button></form>
    <p v-if="error" class="alert error" role="alert">{{ error }} <button class="text-button" @click="load">Reintentar</button></p>
    <p v-if="busy" class="muted small" role="status">Actualizando estadísticas…</p>
    <template v-if="report && !busy">
      <p class="report-period">Período aplicado: {{ date(report.from) }} — {{ date(report.to) }} · {{ report.school_filter || (admin ? 'Todos los colegios' : user.school) }}</p>
      <div class="stats-grid"><div class="stat-card"><span class="stat-icon sage"><AppIcon name="clock" size="23" /></span><div><p>Minutos de pausa activa</p><strong>{{ number(report.totals.minutes) }}</strong><span>Tiempo realizado en el período</span></div></div><div class="stat-card"><span class="stat-icon peach"><AppIcon name="check" size="23" /></span><div><p>Sesiones realizadas</p><strong>{{ number(report.totals.sessions) }}</strong><span>Pausas registradas por docentes</span></div></div><div class="stat-card"><span class="stat-icon lilac"><AppIcon :name="admin ? 'users' : 'clock'" size="23" /></span><div><p>{{ admin ? 'Docentes actuales' : 'Promedio por sesión' }}</p><strong>{{ admin ? number(report.totals.teachers) : (report.totals.sessions ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(report.totals.minutes / report.totals.sessions) : '0') }}<small v-if="!admin"> min</small></strong><span>{{ admin ? 'En las instituciones seleccionadas' : 'Duración media de tus pausas' }}</span></div></div></div>
      <template v-if="admin">
        <div class="panel institution-report"><div class="report-panel-title"><h3>Resumen por colegio</h3><p class="muted small">Comparación de minutos realizados en el período.</p></div><div v-for="item in report.institutions" :key="item.school" class="institution-row"><div><strong>{{ item.school }}</strong><span class="muted small">{{ item.teachers }} docentes actuales · {{ item.sessions }} sesiones</span></div><div class="institution-meter" :aria-label="`${item.school}: ${item.minutes} minutos`"><span :style="{ width: `${item.minutes / maxMinutes * 100}%` }" /></div><strong>{{ number(item.minutes) }} <span class="muted small">min</span></strong></div><p v-if="!report.institutions.length" class="empty">Agrega docentes con su colegio para comenzar el reporte.</p></div>
        <div class="panel report-details"><div class="report-panel-title"><h3>Detalle por profesor e institución</h3><p class="muted small">Cada pausa conserva el colegio donde fue registrada, aunque el docente cambie de institución.</p></div><div class="table-scroll"><table><thead><tr><th>Profesor</th><th>Colegio</th><th>Minutos</th><th>Sesiones realizadas</th></tr></thead><tbody><tr v-for="(teacher, index) in report.teachers" :key="`${teacher.id}-${teacher.school}-${index}`"><td><strong>{{ teacher.name }}</strong><span v-if="!teacher.active" class="historical-badge">Cuenta eliminada</span></td><td>{{ teacher.school }}</td><td>{{ number(teacher.minutes) }} min</td><td>{{ number(teacher.sessions) }}</td></tr></tbody></table></div><p v-if="!report.teachers.length" class="empty">No hay docentes para esta institución.</p></div>
      </template>
      <div v-else class="panel report-details"><div class="report-panel-title"><h3>Mis sesiones realizadas</h3><p class="muted small">Hasta 50 registros recientes del período. Los totales incluyen todas tus sesiones.</p></div><div v-if="report.history.length" class="table-scroll"><table><thead><tr><th>Fecha</th><th>Colegio</th><th>Minutos de pausa</th></tr></thead><tbody><tr v-for="record in report.history" :key="record.id"><td>{{ date(record.performed_on) }}</td><td>{{ record.school }}</td><td>{{ record.minutes }} min</td></tr></tbody></table></div><div v-else class="empty"><AppIcon name="leaf" size="30" /><h3>Tu próxima pausa cuenta</h3><p>No tienes sesiones registradas en este período. Registra una pausa cuando la hayas realizado.</p></div></div>
    </template>
    <ActivityForm v-if="adding" :school="user.school" @close="adding = false" @saved="saved" />
  </section>
</template>
