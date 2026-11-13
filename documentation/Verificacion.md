# Verificación: qué está comprobado y qué no

Este documento separa tres cosas que no deben confundirse:

1. **Implementado en código** — existe en el repositorio y se puede leer.
2. **Verificado con pruebas automatizadas** — cubierto por `npm run check`, que se ejecuta
   sobre una base PostgreSQL temporal en memoria. **No es una prueba con hardware.**
3. **Pendiente de prueba física** — nunca se ha ejecutado con el circuito real.

> ## Estado actual: el prototipo funciona y envía datos reales.
>
> El sketch **se compiló y se cargó** con Arduino IDE en el ESP32 real. En funcionamiento
> se ha comprobado: conexión WiFi, hora por NTP, TLS con el certificado raíz, envíos
> aceptados por `/api/ingest`, detección del tren por los tres sensores infrarrojos,
> pantalla LCD con los nombres de estación en vivo, y recepción de los voltajes del
> panel y de la batería en la plataforma desplegada.
>
> Lo que **sigue sin instrumentos**: no hay multímetro, así que los divisores no están
> calibrados (`CAL_PANEL`/`CAL_BATERIA` = `1.0`) y los voltajes absolutos no están
> contrastados: son lecturas **sin calibrar**. Los cálculos teóricos de la documentación
> siguen marcados como tales.

## Qué cubren las pruebas automatizadas

Dos suites, ejecutables con `npm run check` desde `frontend`:

### `frontend/tests/` — 45 pruebas en tres archivos

A `validation.test.ts` (contrato) se suman `train-state.test.ts` (retención de la
detección, estación siguiente, tiempos de tramo, tiempo de vuelta y rapidez media) y
`realtime-merge.test.ts` (aplicación incremental de los avisos Realtime y salud del
canal). Qué comprueba el contrato, según lo que se puede leer en `validation.test.ts`:

- Se acepta el **cero real** y se conservan los campos ausentes sin inventar cifras.
- Se **rechaza** un mensaje sin lecturas, un bloque vacío y un bloque con todo en `null`.
- **Evento ferroviario**: exige `station_number` entero de 1 a 3 **y** `detected`
  booleano; acepta `detected: false` como **salida** válida del sensor; rechaza
  `station_number` 0, 4 o decimal, el bloque con un solo campo, `detected` como texto, y
  la mezcla con campos antiguos como `levitation_height`.
- **Bloque solar**: acepta `panel_voltage`, `battery_voltage` y `battery_level`, y rechaza
  un `battery_voltage` fuera de rango.
- Se rechazan texto, `NaN`, `Infinity` y porcentajes fuera de 0–100.
- Se rechazan identificadores mal formados, campos desconocidos y fechas futuras.
- El cuerpo que produce `MaglevSender.ino` se acepta, y se rechazan los `null` que el
  firmware elimina antes de enviar.
- Contraseña inicial larga y rol conocido en la creación de usuarios.
- Una fecha antigua o ausente **nunca** se considera LIVE.
- El CSV escapa comillas, neutraliza fórmulas de texto y mantiene los números.
- Un error sin mensaje nunca se muestra vacío.

### `frontend/scripts/check-sql.mjs` — permisos e ingestión en PostgreSQL

Ejecuta los scripts SQL reales sobre una base **PGlite en memoria**, dos veces para
comprobar que son repetibles, y verifica:

- El **auto-registro no concede acceso ni rol de administrador**.
- **Ingestión atómica** y reintento del mismo `sample_id` **sin duplicar**.
- **Contrato nuevo**: una ingestión con `{station_number: 2, detected: true}` llega
  completa a `train_status` y deja `levitation_height` en **`null`**; el bloque solar con
  `panel_voltage`, `battery_voltage` y `battery_level` llega completo.
- `detected: false` se registra como **evento propio**, no se descarta.
- Los **intervalos** (`ms_from_prev`, `lap_ms`) y el bloque `device_health` se guardan;
  la base rechaza un intervalo de 700000 ms y una distancia de tramo negativa.
- Una estación **inexistente** (`station_number = 4`) la **rechaza la base de datos**, no
  solo Zod.
- La tabla `stations` queda con las tres filas y sus nombres iniciales.
- Un **observador** consulta telemetría pero no secretos, no cambia roles, no lee
  `device_credentials` ni `ingest_receipts`, y no puede ejecutar la función de ingestión.
- Las funciones auxiliares de RLS quedan **fuera del esquema expuesto**, y los secretos
  tienen **denegación explícita**.
- Una **cuenta inactiva no accede** a la telemetría.
- **Sin acceso anónimo**; sin auto-bloqueo del último administrador; **dispositivo
  desactivado bloqueado**.

### Qué NO demuestran estas pruebas

- **No** demuestran que un sensor funcione, que un voltaje sea correcto, que la LCD se
  vea, ni que el ESP32 conecte.
- **No** se conectan a ningún proyecto Supabase real: la base es temporal y en memoria.
- **No** compilan ni cargan el firmware.
- **No** validan la calibración: los factores `CAL_PANEL` y `CAL_BATERIA` valen `1.0` y
  nadie los ha comparado con un multímetro.

## Estado del cambio de contrato

El contrato pasó de levitación a **detección por estación y voltaje de batería** (ver
`Modelo_Datos.md`). Ese cambio toca `validation.ts`, `database.sql`, `functions.sql`,
`policies.sql`, `realtime.sql`, `verify.sql`, los tipos y las dos suites de pruebas.

| Comprobación | Estado |
|---|---|
| Las pruebas del contrato nuevo **existen en el repositorio** | Sí: se pueden leer en los archivos citados |
| Se **ejecutaron** | **Sí.** `npm run check` (tipos, 45 pruebas y la suite SQL) y `npm run build` pasan en el entorno de desarrollo y se repiten antes de cada fusión |

Conviene repetirlas en tu equipo antes de la sustentación, desde `frontend`:

```bash
npm ci
npm run check
npm run build
```

## Lo que requiere tu configuración

Para usar la plataforma hay que completar las variables del servidor, ejecutar los scripts
SQL y crear el primer administrador según `Instalacion.md`. Estas comprobaciones dependían
del entorno real y **ya están hechas** con el proyecto Supabase y el ESP32 del
prototipo: inicio de sesión, creación de usuarios y dispositivos, actualizaciones
Realtime, renombrado de estaciones (visible también en la LCD), acceso HTTPS con el
certificado raíz, hora NTP, y compilación y carga del firmware con Arduino IDE.

## Estado por elemento: comprobado en funcionamiento vs pendiente

| Elemento | Estado |
|---|---|
| Compilación y carga del sketch | **Hechas** con Arduino IDE sobre el ESP32 real |
| Conexión WiFi, hora NTP y saludo TLS | **Comprobados en funcionamiento** |
| Envío real a `/api/ingest` | **Comprobado**: la plataforma recibe los eventos |
| Lectura de los tres sensores infrarrojos | **Comprobada** (presencia en nivel bajo; pines 26, 27 y 25) |
| Falsas detecciones | El sensor 2 duplicaba pulsos (~150 ms); quedó filtrado con antirrebote asimétrico (20 ms llegada / 250 ms salida) |
| LCD (dirección I2C, SDA/SCL) | **Comprobada en funcionamiento**: muestra los nombres de estación en vivo |
| Voltaje del panel y de la batería | **Se reciben**, pero **sin calibrar**: no hay multímetro |
| Calibración `CAL_PANEL` / `CAL_BATERIA` | **Sin calibrar** (`1.0`) — **[POR CONFIRMAR]** con multímetro |
| Divisores resistivos y su orientación real | **[POR CONFIRMAR]** con multímetro |
| Identificación real del módulo cargador HW-373 | **[POR VERIFICAR]** |
| Elementos magnéticos instalados (Sistema B) | **[POR CONFIRMAR]**; se demuestra físicamente |
| Distancia de activación magnética | **No medida** |
| Distancias entre estaciones | Medidas con cinta métrica, **aproximadas**: 0.94 m (1→2), 0.78 m (2→3), 0.83 m (3→1) |
| Rapidez media del tren | **Implementada**: el ESP32 mide los tiempos con `millis()` y la web la calcula con las distancias configuradas |

Las tablas de registro para todas estas mediciones están en
`Calculos_Experimentales.md`.

## Discrepancias conocidas entre el código y el prototipo

Las seis discrepancias detectadas en la primera revisión quedaron resueltas: el firmware
ya envía `battery_voltage`, lee los sensores infrarrojos y maneja la LCD; las vistas de
tren y de estación solar están adaptadas al contrato actual; y la imagen del acceso es
una **fotografía de la maqueta real** (`maglev-station.webp`), no una ilustración de
levitación. Queda una sola vigente, por diseño:

- **`measurements`** sigue aceptándose en el contrato por compatibilidad, pero el
  prototipo **no produce ese bloque**: la tabla existe para registros antiguos.

## Repetir las comprobaciones

```bash
cd frontend
npm ci
npm run check     # tipos, pruebas de validación y pruebas SQL
npm run build
```

Para el recorrido real: configura Supabase, registra el ESP32 y sigue
`Integracion_ESP32.md`, `Verificacion_Electrica.md`, `Verificacion_Sensores_IR.md` y
`Verificacion_LCD_I2C.md`, anotando cada resultado en `Calculos_Experimentales.md`.

La plataforma está desplegada en producción (Vercel + Supabase) y recibe los datos del
prototipo real.
