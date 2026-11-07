# Verificación: qué está comprobado y qué no

Este documento separa tres cosas que no deben confundirse:

1. **Implementado en código** — existe en el repositorio y se puede leer.
2. **Verificado con pruebas automatizadas** — cubierto por `npm run check`, que se ejecuta
   sobre una base PostgreSQL temporal en memoria. **No es una prueba con hardware.**
3. **Pendiente de prueba física** — nunca se ha ejecutado con el circuito real.

> ## Ningún componente físico se ha probado.
>
> **No hay ESP32, sensores infrarrojos, panel, batería, LCD ni multímetro disponibles** en
> el entorno donde se redactó esta documentación, y **no existe compilador de Arduino**:
> el sketch **no se ha compilado ni cargado**. No se ha medido ningún voltaje, no se ha
> detectado ningún paso de tren y no se ha encendido ningún LED.
>
> Todas las cifras eléctricas de la documentación son **cálculos teóricos** a partir de
> las fórmulas, o **límites de validación del software**. No hay mediciones.

## Qué cubren las pruebas automatizadas

Dos suites, ejecutables con `npm run check` desde `frontend`:

### `frontend/tests/validation.test.ts` — 11 pruebas del contrato

Qué comprueban, según lo que se puede leer en el archivo:

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
| Las pruebas del contrato nuevo **existen en el repositorio** | Sí: se pueden leer en los dos archivos citados |
| Se **ejecutaron** en esta sesión de documentación | **No.** Las dependencias (`node_modules`) no están instaladas en este entorno |
| Revisión local previa de la entrega | Realizada el 28 de septiembre de 2026, **antes** del cambio de contrato: sus resultados **no cubren** lo nuevo |

Por lo tanto, **antes de la sustentación hay que volver a ejecutar**, desde `frontend`:

```bash
npm ci
npm run check
npm run build
```

y anotar el resultado real. Mientras eso no se haga, el estado correcto de las pruebas del
contrato nuevo es **"escritas, no ejecutadas en esta revisión"**.

## Lo que requiere tu configuración

Para usar la plataforma hay que completar las variables del servidor, ejecutar los scripts
SQL y crear el primer administrador según `Instalacion.md`. Estas comprobaciones dependen
del entorno real y **no están hechas**:

- Inicio de sesión, creación de usuarios y de dispositivos contra tu proyecto Supabase.
- Actualizaciones Realtime con una publicación PostgreSQL y credenciales reales.
- Renombrar una estación desde la plataforma contra la base real.
- Acceso HTTPS desde la red del ESP32, certificado raíz y reloj NTP.
- Compilación y carga del firmware para el modelo concreto de placa.

## Pendiente de prueba física: lista completa

| Elemento | Estado |
|---|---|
| Compilación del sketch | **No realizada.** No hay compilador de Arduino en este entorno |
| Carga del firmware en una placa | **No realizada** |
| Conexión WiFi del ESP32 | **No probada** |
| Saludo TLS con el certificado raíz | **No probado** |
| Hora NTP en la placa | **No probada** |
| Envío real a `/api/ingest` | **No probado** |
| Lectura de los tres sensores infrarrojos | **No probada.** El código de lectura no está en el sketch a la fecha |
| Nivel activo de los sensores (bajo o alto) | **[POR CONFIRMAR]** |
| Pin asignado a cada estación | **[POR CONFIRMAR]** |
| Alcance de detección y falsas detecciones | **No medidos** |
| Divisores resistivos y su orientación real | **No verificados** |
| `PIN_PANEL = 34` y `PIN_BATERIA = 35` contra el circuito | **[POR CONFIRMAR]** |
| Voltaje del panel y de la batería | **No medidos** |
| Calibración `CAL_PANEL` / `CAL_BATERIA` | **Sin calibrar** (`1.0`) |
| Identificación real del módulo cargador HW-373 | **[POR VERIFICAR]** |
| Dirección I2C de la LCD | **[POR CONFIRMAR]** (habitualmente 0x27 o 0x3F) |
| Pines SDA/SCL y tensión del módulo LCD | **[POR CONFIRMAR]** |
| Elementos magnéticos instalados (Sistema B) | **[POR CONFIRMAR]** |
| Distancia de activación magnética | **No medida** |
| Distancias reales entre estaciones | **No medidas** |
| Rapidez media del tren | **No implementada** y no medida |

Las tablas de registro para todas estas mediciones están en
`Calculos_Experimentales.md`.

## Discrepancias conocidas entre el código y el prototipo

Detectadas al revisar el repositorio para esta documentación:

1. **El firmware no envía `battery_voltage`.** `sampleSolarStation()` mide el voltaje de
   la batería y lo usa para estimar el porcentaje, pero el mensaje solo incluye
   `panel_voltage` y `battery_level`. El contrato, la validación, la función de ingestión
   y la columna ya lo aceptan: la columna quedará en `null` hasta que el firmware lo
   incluya.
2. **El firmware no lee los sensores infrarrojos.** El bloque `train_status` solo puede
   entrar hoy por el **puerto serie**. El contrato y la base ya están listos.
3. **El firmware no tiene código de LCD.**
4. **Las vistas de tren y de estación solar** todavía presentan etiquetas de la versión
   con levitación y de corriente/potencia, que el prototipo no mide. La adaptación de la
   interfaz está en curso en esta misma rama.
5. **La imagen `maglev-station.png`** ilustra un tren de levitación: corresponde al diseño
   original, no al prototipo sobre ruedas. Es una ilustración conceptual, no una fotografía
   del prototipo.
6. **`measurements`** sigue aceptándose en el contrato, pero el prototipo **no produce ese
   bloque**.

El firmware y la interfaz se están ampliando en paralelo en esta misma rama: **revisa los
archivos antes de dar por vigente cualquiera de estos puntos.**

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

No se ha publicado ningún sitio ni se han modificado cuentas o bases de datos externas
como parte de esta documentación.
