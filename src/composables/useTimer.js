import { computed, onUnmounted, ref } from 'vue'
export function useTimer(initialSeconds = 180) {
  const remaining = ref(initialSeconds)
  const running = ref(false)
  let interval
  const formatted = computed(() => `${Math.floor(remaining.value / 60).toString().padStart(2, '0')}:${(remaining.value % 60).toString().padStart(2, '0')}`)
  function pause() { clearInterval(interval); running.value = false }
  function reset(seconds = initialSeconds) { pause(); remaining.value = seconds }
  function start() {
    if (running.value || remaining.value === 0) return
    running.value = true
    interval = setInterval(() => { remaining.value--; if (remaining.value === 0) pause() }, 1000)
  }
  onUnmounted(pause)
  return { remaining, running, formatted, start, pause, reset }
}
