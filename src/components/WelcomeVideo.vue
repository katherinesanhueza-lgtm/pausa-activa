<script setup>
import { ref } from 'vue'
import AppIcon from './ui/AppIcon.vue'
defineProps({ admin: Boolean })
defineEmits(['explore'])
const failed = ref(false)
</script>

<template>
  <section class="welcome-video" aria-labelledby="welcome-video-title">
    <div class="welcome-video-copy">
      <span class="pill"><AppIcon name="leaf" size="13" />BIENVENIDA A PAUSA ACTIVA</span>
      <h2 id="welcome-video-title">Un saludo para empezar.<br><em>Una pausa para conectar.</em></h2>
      <p>Hagamos del bienestar un hábito en nuestra comunidad. Muévete, respira y encuentra un momento para ti.</p>
      <button class="button banner-button" @click="$emit('explore')">{{ admin ? 'Conocer a mi equipo' : 'Descubrir las pausas' }}<AppIcon name="arrow" size="17" /></button>
      <div class="welcome-video-caption"><AppIcon name="play" size="15" /><span>Un pequeño saludo para nuestra comunidad educativa.</span></div>
    </div>
    <div class="welcome-video-media">
      <video controls playsinline preload="metadata" poster="/videos/bienvenida-animada.jpg" aria-label="Video de bienvenida de Pausa Activa" @error="failed = true">
        <source src="/videos/bienvenida-animada.mp4" type="video/mp4">
        Tu navegador no admite la reproducción de video.
      </video>
      <p v-if="failed" class="alert error" role="alert">No pudimos reproducir el video. <a href="/videos/bienvenida-animada.mp4">Abrir el video</a></p>
    </div>
  </section>
</template>

<style scoped>
.welcome-video{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:35px;background:#e8eedf;border:1px solid #dfe8d5;border-radius:16px;padding:30px 40px;margin-bottom:32px;overflow:hidden}
.welcome-video-copy{max-width:480px}
.welcome-video h2{font-size:clamp(25px,2.5vw,34px);font-weight:650;line-height:1.4;letter-spacing:-1.1px;margin:20px 0 15px}
.welcome-video h2 em{font-style:normal;color:#6e8757}
.welcome-video-copy>p{color:#7b8c6e;font-size:12px;line-height:1.85;max-width:360px;margin-bottom:23px}
.welcome-video-caption{display:flex;gap:8px;align-items:center;color:#8c9d7f;font-size:10px;margin-top:26px;max-width:300px;line-height:1.7}
.welcome-video-media{width:210px;max-width:100%;position:relative}
.welcome-video video{display:block;width:100%;aspect-ratio:480/854;max-height:375px;object-fit:contain;background:#24382b;border-radius:15px;box-shadow:0 12px 30px #2a432325}
.welcome-video-media>.alert{margin-top:12px;font-size:11px}
@media(max-width:1050px){.welcome-video{padding:25px;gap:22px}.welcome-video-media{width:175px}.welcome-video h2{font-size:25px}.welcome-video .pill{font-size:7px;letter-spacing:1px}}
@media(max-width:780px){.welcome-video{grid-template-columns:1fr;gap:25px}.welcome-video-copy{max-width:none}.welcome-video-copy>p{max-width:430px}.welcome-video-media{width:210px;justify-self:center}.welcome-video h2{font-size:27px}.welcome-video-caption{margin-top:18px}.welcome-video .pill{font-size:8px}.welcome-video{padding:24px}}
</style>
