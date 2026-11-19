import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Permite compilar componentes .vue y actualizarlos durante el desarrollo.
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    // Redirige /api al backend local; conserva Host para comprobar el origen de las solicitudes.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
})
