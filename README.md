# Pausa activa · Comunidad escolar

Aplicación Vue 3 + Vite con servidor Node.js, base de datos SQLite y almacenamiento de videos en disco. Requiere **Node.js 24 o superior**.

## Inicio

```sh
npm install
npm run dev
```

Abre la dirección que muestra Vite, normalmente http://127.0.0.1:5173. La API se ejecuta en http://127.0.0.1:3001.

En el primer inicio completa **Configura tu escuela** con el nombre de la escuela y los datos del administrador. No hay cuentas ni contraseñas predeterminadas. Configura esta cuenta antes de dar acceso al servidor a otras personas.

## Perfiles

- **Colegio:** consulta únicamente los docentes afiliados a su institución y sus resúmenes de minutos y sesiones; no crea usuarios ni modifica docentes.
- **Administrador:** crea colegios y usuarios con perfiles de administrador, colegio o docente desde **Colegios y usuarios**; consulta también las rutinas privadas y puede editarlas. consulta minutos y sesiones por institución y profesor; agrega docentes con nombre, colegio, correo y contraseña; puede corregir su nombre y colegio. Al eliminar un docente se revocan sus sesiones de acceso y se eliminan sus videos y archivos, conservando las pausas realizadas en el reporte histórico.
- **Docente:** ingresa con las credenciales entregadas por el administrador; consulta la biblioteca compartida, filtra por categoría, busca por título o autor y publica videos. Puede eliminar únicamente sus propios videos. Consulta sus minutos y sesiones en el resumen personal y registra las pausas que ha realizado.

Para probar los perfiles, crea un docente desde el administrador, cierra sesión e ingresa con su correo y contraseña. Cada cuenta tiene su perfil asignado por el servidor.

## Videos

El resumen principal de ambos perfiles incluye un video de bienvenida con efecto de dibujo animado y controles de reproducción, sin reproducción automática. El MP4 y su portada están en `public/videos/bienvenida-animada.*`. Conserva el audio del archivo original. Es una estilización del video original mediante suavizado de colores y contornos; conserva su movimiento y duración.

Para volver a procesarlo, `scripts/cartoonize-video.py` recibe el archivo original, el MP4 de destino y la portada JPG. Requiere Python con `numpy`, `opencv-python-headless` e `imageio-ffmpeg`. Estas herramientas solo se usan para preparar el video; no son necesarias para ejecutar la aplicación.

- Archivos MP4 o WebM de hasta 100 MB, guardados en el servidor.
- Enlaces HTTPS de YouTube, Vimeo o archivos directos MP4/WebM.
- Título, descripción opcional y categorías Movimiento, Baile, Respiración y Estiramientos.
- Los videos de la escuela son visibles para todas sus cuentas autenticadas. Los servicios externos pueden restringir la reproducción o quitar sus contenidos; los enlaces no se descargan al servidor.

## Datos y acceso

Los datos se conservan entre reinicios en `data/school.sqlite` y los archivos en `data/uploads/`. Haz respaldo de toda la carpeta `data/` con el servidor detenido. No la publiques ni la subas al repositorio. Las contraseñas se guardan mediante scrypt y las sesiones usan cookies HttpOnly con expiración. Los permisos se verifican en la API.

Esta instalación permite administrar **varios colegios desde un administrador central**. Cada docente tiene un colegio asignado por el administrador. La biblioteca se comparte entre los usuarios de esta instalación; el perfil Colegio tiene acceso de consulta limitado a su institución. No incluye recuperación de contraseña por correo ni envío automático de invitaciones: el administrador entrega las credenciales al docente.

## Minutos, sesiones y reportes

Desde el resumen o **Mi actividad**, el docente usa **Registrar pausa realizada**, indica la duración real (1–180 minutos enteros) y la fecha de realización. También puede usar **Ya realicé esta pausa** desde un video para asociar el registro a ese contenido. Cada registro suma una sesión. Abrir o reproducir un video no suma estadísticas automáticamente: son registros declarados por el docente, no una medición de reproducción ni de asistencia de estudiantes.

El resumen muestra por defecto el mes actual, con filtros de fechas. El administrador puede filtrar por colegio y revisar totales, comparación entre instituciones y detalle por profesor. Los docentes solo pueden consultar su propia actividad; el servidor toma la identidad y el colegio de la sesión autenticada, sin permitir atribuir registros a otro profesor.

Las pausas guardan una copia del nombre y colegio al registrarse. Cambiar el colegio de un profesor no traslada sus pausas anteriores a la nueva institución. El historial se conserva incluso si se elimina la cuenta o el video asociado. El número de docentes en el reporte corresponde a las cuentas actuales; los minutos y sesiones pueden incluir cuentas eliminadas, identificadas como tales en el detalle. La tabla de gestión de docentes muestra totales históricos; el dashboard muestra el período seleccionado. Las fechas usan America/Santiago.

## Compilar y ejecutar

```sh
npm run build
npm start
```

El servidor sirve la aplicación compilada y la API desde http://127.0.0.1:3001. `npm run preview` solo previsualiza el frontend y no reemplaza al servidor completo.

Para acceso desde otros equipos configura `HOST=0.0.0.0` y, para publicación, un proxy HTTPS y `COOKIE_SECURE=true`. Las variables se definen en el entorno del proceso (no se carga un archivo `.env` automáticamente). `PORT` cambia el puerto de producción y `DATA_DIR` cambia la carpeta de datos. En desarrollo el proxy de Vite apunta al puerto 3001.

## Verificar

```sh
npm test
npm run build
```

Las pruebas de integración usan un directorio temporal y verifican configuración inicial, inicio y cierre de sesión, creación de docentes, validación de entradas, permisos entre perfiles y autores, enlaces, subida de archivos, rangos de reproducción, persistencia entre reinicios y eliminación de docentes con revocación de acceso. También verifican los reportes por institución y profesor, filtros de fechas, registros duplicados, validación de minutos, privacidad del resumen personal y conservación del historial al cambiar de colegio o eliminar una cuenta.

## Estructura

- `server/index.js`: API, autenticación, SQLite, archivos y servidor de producción.
- `server/index.test.js`: pruebas de integración.
- `scripts/dev.mjs`: inicio conjunto de Vite y API.
- `src/views/AuthView.vue`: configuración inicial e inicio de sesión.
- `src/views/DashboardView.vue`: panel según el perfil de la cuenta.
- `src/components/TeacherManager.vue`: alta y eliminación de docentes.
- `src/components/VideoLibrary.vue`: biblioteca, filtros, reproducción y eliminación.
- `src/components/VideoForm.vue`: publicación de enlaces y archivos.
- `src/components/WelcomeVideo.vue`: video de bienvenida del resumen principal.
- `src/components/ActivityForm.vue`: registro de pausas realizadas.
- `src/components/ActivityDashboard.vue`: estadísticas personales y reportes por institución.
- `src/components/ui/`: iconos, diálogos y controles reutilizables.
- `src/services/api.js`: cliente de la API.
- `src/style.css`: diseño adaptable a escritorio y móvil.

## Rutinas

Desde Comunidad y Mis rutinas se pueden crear rutinas con videos de la biblioteca, descripciones y duración por ejercicio. Se organizan por sesiones, bloques o días y permiten reordenar secciones y ejercicios. Cada rutina tiene curso e intensidad (baja, media o alta), con filtros por colegio, curso e intensidad.

Las rutinas públicas se comparten con las cuentas autenticadas de esta instalación. Cada docente puede guardar una copia privada y editarla para adaptarla; los cambios de la copia no modifican el original. Las privadas son accesibles al autor y al administrador central.

La base existente se actualiza al iniciar el servidor, conservando cuentas, sesiones, videos, rutinas y registros históricos.
