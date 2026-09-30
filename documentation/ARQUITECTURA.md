# Arquitectura del sistema

## Recorrido de una lectura

El sensor mide; el firmware genera un mensaje JSON real; el ESP32 lo envía por HTTPS a `/api/ingest`; el servidor autentica el dispositivo y llama a una función transaccional en Supabase. PostgreSQL guarda las lecturas y Supabase Realtime informa al navegador. La web vuelve a consultar la ventana de datos del dispositivo elegido.

Esta capa de recepción evita guardar la clave privada de Supabase en el ESP32. El microcontrolador solo conoce su clave individual; el servidor almacena su hash SHA-256. Rotar la clave de un dispositivo no cambia la de los demás.

## Frontend

Next.js App Router y React con TypeScript forman las páginas. `app/(monitor)/layout.tsx` aplica `ProtectedShell` a todas las vistas privadas. La verificación visual de sesión no sustituye los permisos: RLS protege las tablas y cada API administrativa valida el token con Supabase Auth, consulta el perfil real y exige `active=true` y `role=admin`.

`AuthProvider` escucha eventos de autenticación y revisa el perfil cada 30 segundos. `TelemetryProvider` obtiene dispositivos, consulta las tres tablas de telemetría, se suscribe a cambios y realiza una consulta de respaldo cada 15 segundos. Limpia canales al cambiar de dispositivo o salir. Un contador de consultas evita aplicar respuestas anteriores a la selección actual.

Los componentes Recharts muestran mediciones existentes, ordenadas por fecha de recepción. Los datos nulos no se reemplazan por cero. Las métricas indican la última lectura; la interfaz mantiene visible cuándo se recibió. Los mensajes de fallo conservan las últimas lecturas como información potencialmente antigua, sin afirmar que el sistema funciona normalmente.

## Backend

`app/api/admin/users` permite listar, crear y modificar perfiles. Las contraseñas son gestionadas por Supabase Auth; nunca se guardan en `profiles`. Crear una cuenta no envía un correo: el administrador verifica la identidad y entrega la contraseña inicial. El usuario puede cambiarla en Configuración.

`app/api/admin/devices` crea dispositivos, habilita/deshabilita recepción y rota su clave. `app/api/ingest` verifica id y clave, limita el tamaño JSON a 16 KiB, valida con Zod y ejecuta `ingest_telemetry`. Los endpoints usan el runtime Node.js; no funcionan en un hosting exclusivamente estático.

Las operaciones administrativas reciben `Authorization: Bearer <access_token>`. No se confía en un campo role enviado por el navegador. Las respuestas con claves utilizan `Cache-Control: no-store`. El token individual del ESP32 se devuelve solo cuando se crea o rota.

## Persistencia y permisos

Los perfiles nuevos siempre nacen como observadores inactivos, aunque el registro incluya metadatos que intenten asignar un rol. Los observadores activos leen dispositivos y telemetría; solo leen su propio perfil. Los administradores activos leen perfiles del proyecto. Los clientes autenticados no pueden escribir directamente en ninguna tabla de monitoreo ni acceder a claves.

`admin_update_profile` protege contra pérdida del último administrador y usa un bloqueo transaccional para evitar cambios concurrentes incompatibles. `ingest_telemetry` bloquea el dispositivo durante la recepción, comprueba su estado, registra la identidad del mensaje, escribe las tablas y actualiza `last_seen` de manera atómica.

## Alcance

El sistema consulta telemetría: no controla el movimiento físico, frenado, electroimanes ni otras funciones del prototipo. La estabilidad porcentual debe estar definida por el controlador. No se infiere seguridad operativa a partir de una conexión activa. La imagen del tren es conceptual y no representa una transmisión de cámara.

Cada proyecto Supabase representa una instalación. Esta versión no implementa organizaciones separadas, alertas por correo, retención automática ni cola persistente en el ESP32. Las cuentas activas consultan todos los dispositivos de esa instalación. Revisa los límites de tu plan y la retención de lecturas y recibos antes de periodos prolongados de adquisición.
