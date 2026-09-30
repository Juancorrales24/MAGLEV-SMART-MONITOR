# Instalación y solución de problemas

## Preparar el computador

Instala Node.js 22 o posterior. Comprueba `node --version` y `npm --version` en la terminal. Descomprime el ZIP completo; no ejecutes archivos directamente dentro del comprimido. Abre la carpeta en Visual Studio Code si quieres revisar o modificar el código.

En una terminal entra a `MAGLEV-SMART-MONITOR-V1.1-REAL-DATA-FINAL/frontend`. Ejecuta `npm ci`. El comando descarga las librerías: no es necesario copiarlas manualmente ni instalar un backend Python.

## Preparar Supabase

La instalación está diseñada para un proyecto Supabase dedicado. También incorpora una actualización no destructiva de la tabla `measurements` del ZIP inicial: agrega dispositivo, identificador de mensaje y fecha de muestreo. Si ya existe esa tabla, sus marcas de tiempo sin zona se interpretan como UTC, que es el valor predeterminado de Supabase. Respalda primero si tu proyecto utiliza otra zona o ha sido modificado.

Los registros antiguos sin `device_id` permanecen en el historial de “Todos”. No se asignan automáticamente a un sensor ni se muestran como la lectura de un dispositivo. Solo vincúlalos cuando conozcas su procedencia real. La migración no pretende adaptar esquemas ajenos al ZIP inicial.

Ejecuta los cuatro scripts principales en el orden del README. Cada bloque debe terminar sin errores antes del siguiente. Puedes volver a ejecutarlos; sus operaciones son repetibles para este esquema. Las tablas se crean con RLS activada y sin datos de demostración. `supabase/verify.sql` permite revisar tablas, políticas y publicación.

Crea el usuario en Authentication → Users y ejecuta `bootstrap_admin.sql` con su correo. Es normal que la cuenta permanezca inactiva antes de este paso. Para una instalación privada, deshabilita el registro de usuarios nuevos en la configuración de Auth; incluso si queda habilitado, el trigger deja cualquier registro nuevo inactivo y sin permisos administrativos.

## Variables de entorno

| Variable | Uso | Dónde puede estar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto | Navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública anon/publishable | Navegador y servidor, protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Administración e ingestión | Solo servidor |
| `NEXT_PUBLIC_STALE_SECONDS` | Antigüedad máxima de recepción para LIVE | Navegador; 60 por defecto, mínimo 10 |

Copia `.env.example` a `.env.local`, completa las cuatro variables y reinicia el proceso de Next.js. Las variables públicas quedan incorporadas durante la compilación: recompila si las cambias en producción. `.env.local` está excluido de Git y del ZIP entregado.

## Abrir y comprobar

Ejecuta `npm run dev`, abre `http://localhost:3000`, entra con el usuario habilitado y registra un dispositivo. Sin datos, la página debe mostrar guiones y mensajes de espera. Una pantalla sin cifras es el estado correcto antes de conectar sensores.

Para uso real compila con `npm run build` y ejecuta con `npm run start`. Usa HTTPS en el alojamiento y configura las variables del servidor. El acceso web y el emisor necesitan conectividad con el servidor y Supabase.

## Problemas frecuentes

| Síntoma | Revisión |
|---|---|
| Login deshabilitado | Faltan la URL o clave pública. Completa `.env.local` y reinicia. |
| Correo/contraseña no aceptados | Verifica la cuenta en Authentication y el estado de confirmación del correo. |
| Acceso pendiente | Ejecuta la habilitación del primer administrador o activa el perfil desde Usuarios. |
| No se pudo cargar perfil | Revisa `database.sql`, trigger, permisos y conexión. |
| Consultas funcionan pero crear usuario falla | Revisa `SUPABASE_SERVICE_ROLE_KEY` y `functions.sql`. |
| Realtime no conecta | Ejecuta `realtime.sql`, revisa acceso a WebSockets y los registros del proyecto. |
| No aparecen valores | No hay lecturas para ese dispositivo, el emisor no llegó a la API o falta un bloque de medición. |
| API devuelve 401 | Clave/id del dispositivo incorrectos o sesión administrativa inválida. |
| API devuelve 403 | Dispositivo desactivado o usuario sin rol administrativo. |
| API devuelve 429 | Espacia los mensajes; se permite uno nuevo por segundo por dispositivo. |
| API devuelve 400 | Revisa nombres de campos, UUID, números, rangos y fechas. |
| Firmware no conecta por HTTPS | Revisa CA raíz, dominio, reloj NTP y conectividad. |
| Puerto 3000 ocupado | Usa `npm run dev -- --port 3001` y abre ese puerto. |

Para recuperar una cuenta que olvidó su contraseña, el responsable del proyecto debe usar las herramientas de Supabase Auth. La web permite cambiar la contraseña conociendo la actual; no simula un enlace de recuperación sin configuración de correo.
