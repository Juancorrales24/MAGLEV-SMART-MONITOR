# Arquitectura del sistema

## Qué monitorea realmente el sistema

El prototipo **no usa levitación magnética**: el tren circula sobre ruedas sobre rieles
convencionales y su paso se detecta con **tres sensores infrarrojos**, uno por estación.
El segundo subsistema monitoreado es la **estación solar**, de la que se miden el
**voltaje del panel** y el **voltaje de la batería** mediante divisores resistivos.

Lo que el sistema **no** monitorea: altura de levitación, estabilidad magnética,
temperatura, corriente y potencia. Los campos correspondientes siguen existiendo en el
esquema **por compatibilidad** con registros de la versión anterior y quedan en `null`.
El detalle del hardware está en `Hardware_Prototipo.md`; el del contrato, en
`Modelo_Datos.md`.

La iluminación magnética de las estaciones (**Sistema B**) es un **circuito independiente
del ESP32**: no pasa por el microcontrolador, la web **no recibe el estado de esos LED** y
no existe ningún campo del contrato que los represente. Su funcionamiento se demuestra
físicamente.

## Recorrido de una lectura

El sensor genera un evento o una medida; el firmware arma un mensaje JSON real; el ESP32
lo envía por HTTPS a `/api/ingest`; el servidor autentica el dispositivo y llama a una
función transaccional en Supabase. PostgreSQL guarda las lecturas y Supabase Realtime
informa al navegador. La web vuelve a consultar la ventana de datos del dispositivo
elegido.

```
Sensores IR / divisores resistivos
        │
     ESP32  ──WiFi──►  HTTPS  ──►  /api/ingest (Next.js, runtime Node.js)
                                        │  valida credenciales y contrato
                                        ▼
                              ingest_telemetry() en Supabase
                                        │  transacción
                                        ▼
                     PostgreSQL ──Realtime──► Navegador
```

Esta capa de recepción evita guardar la clave privada de Supabase en el ESP32. El
microcontrolador solo conoce **su** clave individual; el servidor almacena su hash
SHA-256 y la compara en tiempo constante. Rotar la clave de un dispositivo no cambia la
de los demás. Ver `Seguridad.md`.

## Frontend

Next.js App Router y React con TypeScript forman las páginas. `app/(monitor)/layout.tsx`
aplica `ProtectedShell` a todas las vistas privadas. La verificación visual de sesión no
sustituye los permisos: RLS protege las tablas y cada API administrativa valida el token
con Supabase Auth, consulta el perfil real y exige `active=true` y `role=admin`.

`AuthProvider` escucha eventos de autenticación y revisa el perfil cada 30 segundos.
`TelemetryProvider` obtiene dispositivos, consulta las tablas de telemetría, se suscribe
a cambios y los aplica incrementalmente sobre la ventana cargada. Si el canal Realtime
se cae, lo recrea con espera exponencial y, mientras tanto, consulta cada 4 segundos
(cada 20 segundos como red de seguridad con el canal sano); al volver a la pestaña o
recuperar la red consulta de inmediato. Limpia canales al cambiar
de dispositivo o salir. Un contador de consultas evita aplicar respuestas anteriores a la
selección actual, y una sola consulta automática corre a la vez.

Los componentes Recharts muestran mediciones existentes, ordenadas por fecha de
recepción. **Los datos nulos no se reemplazan por cero.** Las métricas indican la última
lectura y la interfaz mantiene visible cuándo se recibió. Los mensajes de fallo conservan
las últimas lecturas como información potencialmente antigua, sin afirmar que el sistema
funciona normalmente.

> Las vistas de tren y de estación solar ya están adaptadas al contrato actual. La
> referencia de qué dato existe y qué significa sigue siendo `Modelo_Datos.md`.

## Backend

`app/api/admin/users` permite listar, crear y modificar perfiles. Las contraseñas las
gestiona Supabase Auth; nunca se guardan en `profiles`. Crear una cuenta no envía un
correo: el administrador verifica la identidad y entrega la contraseña inicial. El usuario
puede cambiarla en Configuración.

`app/api/admin/devices` crea dispositivos, habilita o deshabilita la recepción y rota su
clave. `app/api/admin/stations` renombra una de las tres estaciones por su `position`
(1–3); el firmware solo envía el número, de modo que **renombrar no obliga a recargar el
firmware**. `app/api/ingest` verifica identificador y clave, limita el cuerpo a 16 KiB,
valida con Zod y ejecuta `ingest_telemetry`. Los endpoints usan el runtime Node.js: no
funcionan en un alojamiento exclusivamente estático.

Las operaciones administrativas reciben `Authorization: Bearer <access_token>`. No se
confía en un campo `role` enviado por el navegador. Las respuestas con claves usan
`Cache-Control: no-store`. El token individual del ESP32 se devuelve **solo** al crearlo o
rotarlo.

Un detalle deliberado de la ruta de ingestión: un **fallo de la base de datos responde
5xx, no 401**. El emisor descarta la muestra ante un 4xx y la conserva ante un 5xx, así
que confundir los dos casos perdería lecturas válidas.

## Persistencia y permisos

Los perfiles nuevos siempre nacen como **observadores inactivos**, aunque el registro
incluya metadatos que intenten asignar un rol. Los observadores activos leen dispositivos,
estaciones y telemetría, y solo su propio perfil. Los administradores activos leen los
perfiles del proyecto. Los clientes autenticados **no pueden escribir directamente en
ninguna tabla** ni acceder a claves: `device_credentials` e `ingest_receipts` tienen
políticas restrictivas de denegación, que siguen vigentes aunque alguien conceda
privilegios por error.

Las funciones auxiliares de RLS viven en un esquema **no expuesto** por la API de
Supabase, para que no puedan invocarse como RPC.

`admin_update_profile` protege contra la pérdida del último administrador y usa un bloqueo
transaccional para evitar cambios concurrentes incompatibles. `ingest_telemetry` bloquea
el dispositivo durante la recepción, comprueba su estado, registra la identidad del
mensaje, escribe las tablas y actualiza `last_seen` de forma atómica.

Tablas publicadas en Realtime: `devices`, `measurements`, `stations`, `train_status`,
`solar_station` y `device_health`. **`device_credentials` e `ingest_receipts` no se
publican.**

## Límite de frecuencia y su efecto en el diseño

`ingest_telemetry` acepta **un mensaje nuevo cada 400 ms por dispositivo**. El firmware
espacia sus envíos 500 ms o más, mantiene una cola en RAM y, ante un **429**, reintenta
con espera fija de 600 ms (ante 5xx o error de red, con espera exponencial hasta 60 s).
El dato no se pierde, pero **la hora de llegada no es la hora del suceso**.

De ahí una consecuencia de arquitectura: los tiempos entre estaciones se miden con el
**temporizador monotónico local del ESP32** (`millis()`), nunca con `created_at`. Así
está implementado: los eventos de llegada viajan con `ms_from_prev` y `lap_ms` (ver
`Modelo_Datos.md`); el diseño original se conserva en `Ampliacion_Rapidez_Media.md`.

## Alcance

El sistema **consulta telemetría**: no controla el movimiento físico, el frenado, ni
ningún actuador del prototipo. No se infiere seguridad operativa a partir de una conexión
activa. La imagen de la pantalla de acceso es una **fotografía de la maqueta real**, no una
transmisión de cámara; el esquema de la vía del panel es una ilustración.

Lo que **no** incluye esta versión: telemetría del Sistema B,
medición de corriente o potencia, organizaciones separadas, alertas por correo, retención
automática ni cola persistente en el ESP32. Las cuentas activas consultan todos los
dispositivos de la instalación. Revisa los límites de tu plan de Supabase y la retención
de lecturas y recibos antes de periodos prolongados de adquisición.

Cada proyecto Supabase representa una instalación.
