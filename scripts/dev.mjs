import { spawn } from 'node:child_process'
// Inicia juntos el backend con recarga y Vite, mostrando su salida en esta terminal.
const processes = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
]
// Detiene ambos procesos cuando termina uno o se solicita cerrar el entorno de desarrollo.
function stop() { for (const child of processes) child.kill() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of processes) child.on('exit', () => { stop(); process.exitCode = 0 })
