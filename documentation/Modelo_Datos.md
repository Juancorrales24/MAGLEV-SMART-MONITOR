# Modelo de datos, contrato JSON y unidades

Esta es la referencia del contrato vigente. Todo lo que aparece aquí se puede comprobar
leyendo `frontend/lib/validation.ts`, `supabase/database.sql`, `supabase/functions.sql`,
`frontend/lib/database.types.ts` y `frontend/app/api/ingest/route.ts`.

El prototipo **no usa levitación magnética**: el tren circula sobre ruedas y su paso se
detecta con sensores infrarrojos. Ver `Hardware_Prototipo.md`.

## Tablas

| Tabla | Contenido | Quién escribe |
|---|---|---|
| `profiles` | id de Auth, nombre, correo, rol, activo, creación | Trigger de Auth y API administrativa |
| `devices` | Nombre, tipo, ubicación, habilitado, última recepción | API administrativa / ingestión |
| `device_credentials` | Hash SHA-256 de la clave de cada dispositivo | Solo API administrativa |
| `ingest_receipts` | Identidad de los mensajes aceptados | Solo ingestión; evita duplicados |
| `stations` | **Nombres editables de las tres estaciones** | Solo API administrativa |
| `train_status` | **Eventos de los sensores infrarrojos** | Solo ingestión |
| `solar_station` | **Voltajes del panel y de la batería, porcentaje estimado** | Solo ingestión |
| `measurements` | Variables eléctricas genéricas — **compatibilidad, no la usa el prototipo** | Solo ingestión |

Cada tabla de lecturas tiene `id` UUID, `device_id` UUID, `sample_id` UUID, `sampled_at`
opcional y `created_at` generado por el servidor. Un mensaje puede crear una fila en cada
una de las tres tablas de lecturas, con la misma fecha de recepción y el mismo
`sample_id`.

`created_at` y `last_seen` determinan el estado de conexión. **No se usa el reloj del
ESP32 para afirmar que una recepción es reciente.** `sampled_at` describe el momento de
adquisición cuando el emisor lo conoce; el CSV conserva las fechas en UTC y el navegador
las muestra en la zona local.

### `stations` — nombres editables desde la web

| Columna | Tipo | Restricción | Significado |
|---|---|---|---|
| `id` | uuid | clave primaria | — |
| `position` | smallint | **única**, entre 1 y 3 | Número de la estación, el mismo que viaja en `station_number` |
| `name` | text | 1 a 100 caracteres | Etiqueta mostrada en la web |
| `created_at` | timestamptz | — | — |

`database.sql` inserta las tres filas iniciales con los nombres `Estación 1`,
`Estación 2` y `Estación 3` (`on conflict do nothing`: volver a ejecutar el script no
sobrescribe un nombre que ya hayas cambiado).

Separación importante:

- El **firmware envía solo el número** (`station_number`), fijado por el cableado del
  sensor. Nunca envía el nombre.
- El **nombre vive en la base** y se edita con `PATCH /api/admin/stations`
  (`{ "position": 1-3, "name": "texto" }`), que exige sesión de **administrador
  activo**. **[IMPLEMENTADO]** en `frontend/app/api/admin/stations/route.ts`.
- Por lo tanto **renombrar una estación no obliga a recargar el firmware**.
- Los usuarios activos pueden **leer** `stations`; no pueden escribirla directamente
  (RLS solo concede `select`). La tabla está publicada en Realtime, así que un cambio de
  nombre llega al navegador sin recargar.

### `train_status` — eventos de los sensores infrarrojos

| Columna | Tipo | Rango en la base | Significado |
|---|---|---|---|
| `station_number` | smallint | 1 a 3 | Qué sensor generó el evento |
| `detected` | boolean | — | `true` = llegada/presencia; `false` = salida |
| `levitation_height` | double | 0 a 1000 | **Compatibilidad.** No es lectura del prototipo: queda `null` |
| `stability` | double | 0 a 100 | **Compatibilidad.** No es lectura del prototipo: queda `null` |
| `temperature` | double | −100 a 500 | **Compatibilidad.** No es lectura del prototipo: queda `null` |

`ingest_telemetry` inserta **únicamente** `station_number` y `detected` desde el bloque
`train_status`; las tres columnas de levitación **no se escriben nunca** y quedan en
`null`. Se conservan en la tabla para no destruir los registros de la versión anterior
del proyecto. Está comprobado en `frontend/scripts/check-sql.mjs`
(**[PRUEBAS AUTOMATIZADAS]**), que verifica que una ingestión con
`{station_number: 2, detected: true}` deja `levitation_height` en `null`.

Las columnas son anulables porque las filas antiguas no tienen número de estación. Una
fila del prototipo actual siempre llega con los dos campos.

### `solar_station` — estación solar

| Columna | Tipo | Rango en la base | Significado |
|---|---|---|---|
| `panel_voltage` | double | 0 a 10000 | Voltaje del panel, en **V**, por divisor resistivo |
| `battery_voltage` | double | 0 a 10000 | Voltaje de la batería, en **V**, por divisor resistivo |
| `battery_level` | double | 0 a 100 | **Estimación** del porcentaje a partir del voltaje, en **%** |
| `panel_current` | double | −10000 a 10000 | **Compatibilidad.** El prototipo **no mide corriente**: queda `null` |
| `power_output` | double | −100000000 a 100000000 | **Compatibilidad.** Sin corriente no hay potencia medida: queda `null` |

Sobre `battery_level`: **es una estimación basada en voltaje, no una medición directa de
carga**. El firmware la calcula con una curva aproximada de descarga de celda de litio
por tramos entre 3.00 V y 4.20 V. Esa curva **no está calibrada para esta celda** y la
tensión de una celda de litio depende también de la corriente que esté entregando o
recibiendo en ese momento, así que el porcentaje debe presentarse como estimación.

Sobre `panel_current` y `power_output`: el prototipo **no tiene INA219 ni sensor de
corriente equivalente**. No deben rellenarse con un cálculo inventado ni mostrarse como
medición. Quedan `null`, y la web representa `null` como `—`.

### `measurements` — compatibilidad

| Columna | Unidad | Rango |
|---|---|---|
| `voltage` | V | 0 a 10000 |
| `current` | A | −10000 a 10000 |
| `power` | W | −100000000 a 100000000 |
| `energy` | Wh | 0 a 10¹² |

Esta tabla viene de la versión inicial del proyecto. **El prototipo actual no produce
este bloque**: el firmware no lo genera. Se conserva porque el historial puede contener
filas antiguas y porque la API sigue aceptándolo si algún día se añade un medidor
eléctrico. `measurements.device_id` admite `null`: las filas heredadas sin dispositivo
permanecen en el historial general y **no se atribuyen a ningún sensor**.

## Contrato JSON de `/api/ingest`

Cabeceras obligatorias:

```http
POST /api/ingest
Content-Type: application/json
Authorization: Bearer DEVICE_TOKEN
X-Device-Id: DEVICE_ID
```

Cuerpo: `sample_id` (UUID) y **al menos uno** de los tres bloques. Opcionalmente
`sampled_at` en ISO 8601 **con zona horaria**.

| Campo raíz | Obligatorio | Regla |
|---|---|---|
| `sample_id` | **Sí** | UUID |
| `sampled_at` | No | ISO 8601 con desplazamiento; no más de 5 minutos en el futuro |
| `train_status` | Al menos un bloque | Ver abajo |
| `solar_station` | Al menos un bloque | Ver abajo |
| `measurements` | Al menos un bloque | Compatibilidad |

### Bloque `train_status`

| Campo | Tipo | Obligatorio | Valores |
|---|---|---|---|
| `station_number` | entero | **Sí** | 1, 2 o 3 |
| `detected` | booleano | **Sí** | `true` (llegada) o `false` (salida) |

**Los dos campos son obligatorios.** Este bloque **no** sigue la regla de "al menos una
lectura numérica" de los bloques de medición, precisamente porque `detected: false` es
un evento válido: la **salida** del tren del campo del sensor, no una lectura vacía.
Está cubierto por `frontend/tests/validation.test.ts` (**[PRUEBAS AUTOMATIZADAS]**), que
rechaza `station_number` igual a 0, a 4 o decimal, el bloque sin uno de los dos campos,
`detected` como texto, y la mezcla con campos antiguos como `levitation_height`.

### Bloque `solar_station`

| Campo | Unidad | Rango | Obligatorio |
|---|---|---|---|
| `panel_voltage` | V | 0 a 10000 | No |
| `battery_voltage` | V | 0 a 10000 | No |
| `battery_level` | % | 0 a 100 | No |
| `panel_current` | A | −10000 a 10000 | No — compatibilidad |
| `power_output` | W | ±100000000 | No — compatibilidad |

El bloque debe contener **al menos un número**. Un bloque con todos los campos en `null`
o vacío se rechaza con 400.

### Ejemplos — estructura, no mediciones

> **Las cifras de estos ejemplos son valores de estructura para ilustrar el formato.
> No son mediciones del prototipo:** no se ha leído ningún sensor real. Los `sample_id`
> son UUID de ejemplo.

Evento de llegada del tren a la estación 2:

```json
{
  "sample_id": "c0f1dd43-6db9-46fd-8b89-399a2ce4c480",
  "train_status": { "station_number": 2, "detected": true }
}
```

Evento de salida del mismo sensor, con otro `sample_id`:

```json
{
  "sample_id": "6f4b9d8e-2a71-4c35-9f0a-1b2c3d4e5f60",
  "train_status": { "station_number": 2, "detected": false }
}
```

Muestra de la estación solar:

```json
{
  "sample_id": "9a7c2e10-55b4-4ad8-8c33-7e1f0b6d4a92",
  "solar_station": {
    "panel_voltage": 5.8,
    "battery_voltage": 3.7,
    "battery_level": 20
  }
}
```

Los dos bloques en un solo mensaje, con fecha de adquisición:

```json
{
  "sample_id": "1d3f5a79-8b2c-4e60-9a14-c7d8e9f0a1b2",
  "sampled_at": "2026-11-07T15:04:05-05:00",
  "train_status": { "station_number": 1, "detected": true },
  "solar_station": { "panel_voltage": 5.8, "battery_level": 20 }
}
```

Lo que **no** debe enviarse:

```json
{
  "sample_id": "...",
  "train_status": { "station_number": 2 },
  "solar_station": { "panel_current": 0.42, "power_output": 2.4 }
}
```

- `train_status` sin `detected`: **400**, falta un campo obligatorio.
- `panel_current` y `power_output` con cifras: el prototipo **no mide corriente**.
  Enviar un número ahí sería inventar una medición. **Omítelos.**

## Reglas generales de validación

- Todos los valores medidos son **números JSON finitos**. Texto, `NaN` e `Infinity` se
  rechazan. **[PRUEBAS AUTOMATIZADAS]**
- Un campo **ausente o `null` significa desconocido**, y la web lo muestra como `—`.
- El **cero es una medición válida** y se conserva: no se confunde con ausencia.
- Los **campos desconocidos se rechazan** (esquemas estrictos), para detectar errores de
  nombre antes de guardar datos mal interpretados.
- Los rangos de la tabla son **límites de formato, no umbrales seguros de operación**.
  Que la API acepte 10000 V no significa que el prototipo pueda medirlos.
- Tamaño máximo del cuerpo: **16 KiB**. Falta de `Content-Type: application/json`: 415.

## Códigos de respuesta reales de `/api/ingest`

Tomados de `frontend/app/api/ingest/route.ts`, `frontend/lib/server.ts` y
`supabase/functions.sql`.

| Código | Cuerpo / causa |
|---|---|
| **201** | Lectura nueva guardada: `{ "ok": true, "duplicate": false }` |
| **200** | Ese `sample_id` ya fue aceptado antes: `{ "ok": true, "duplicate": true }` |
| **400** | JSON inválido, campo desconocido, tipo o rango fuera de contrato, `sampled_at` más de 5 minutos en el futuro, mensaje sin ningún bloque, o rechazo de una restricción `check` de la base |
| **401** | `X-Device-Id` no es un UUID, falta el token, el token supera 256 caracteres, o la clave no coincide con el hash almacenado |
| **403** | Dispositivo **deshabilitado** desde la plataforma |
| **413** | Cuerpo mayor de 16 KiB |
| **415** | `Content-Type` distinto de `application/json` |
| **429** | Más de un mensaje **nuevo** por segundo para ese dispositivo |
| **500** | Error no previsto del servidor o de la base |
| **503** | Falta configuración de Supabase en el servidor, o Supabase Auth no responde |

Dos detalles de diseño que importan al firmware:

- Un **fallo de la base no devuelve 401**, sino 5xx. El emisor trata 401 como error
  definitivo y **descarta** la muestra; con 5xx la conserva y reintenta. Esto está
  explícito en el código y comentado allí.
- Un **duplicado se detecta antes del límite de frecuencia**: reintentar el mismo
  `sample_id` devuelve 200, no 429.

## Identidad de la muestra y deduplicación

- `sample_id` es **único por dispositivo** en `ingest_receipts`.
- Un reintento del mismo mensaje devuelve `duplicate: true` y **no vuelve a escribir**.
- El emisor debe **conservar el mismo UUID en cada reintento** y generar uno **nuevo**
  para una adquisición diferente. El sketch lo hace así: genera el UUID al aceptar la
  lectura y no lo cambia durante los reintentos.
- La deduplicación **no permite completar un mensaje por partes**: si envías un bloque
  con un `sample_id` y luego otro bloque con el mismo `sample_id`, el segundo se descarta
  como duplicado. **Envía juntos los bloques de una misma adquisición.**
- Cada evento de sensor es una adquisición distinta y necesita su propio `sample_id`.

## Límite de frecuencia y su consecuencia práctica

`ingest_telemetry` rechaza un mensaje nuevo si `last_seen` del dispositivo es de hace
menos de **1 segundo**. Como `last_seen` se actualiza con cada mensaje aceptado, el
límite es de **un mensaje nuevo por segundo y por dispositivo**, sea del tren o solar.

Consecuencia concreta para este prototipo: hay **un solo ESP32** para los tres sensores y
la estación solar. Si un evento de detección coincide con la muestra solar de los 5
segundos, o si el tren pasa por dos sensores en menos de un segundo, el segundo mensaje
recibe **429** y el emisor lo reintenta con espera creciente (2 s, 4 s, … hasta 60 s). El
dato **no se pierde**, pero **llega más tarde**, y el `created_at` de la base reflejará la
hora de recepción, no la del paso del tren.

Por esa razón, cualquier cálculo de tiempos entre estaciones debe basarse en un
temporizador **local** del ESP32 y no en las horas de llegada de los mensajes. Ver
`Ampliacion_Rapidez_Media.md`.

## Índices y consultas

- Índice único `(device_id, sample_id)` en cada tabla de lecturas: respalda la
  deduplicación.
- Índices `(device_id, created_at desc, id desc)` para la ventana reciente de cada
  dispositivo.
- `train_station` sobre `(station_number, created_at desc, id desc)`: permite filtrar el
  historial de detecciones de **una estación concreta**.
- `measurements_history` sobre `(created_at desc, id desc)`: paginación del historial
  general.

Los tipos `train`, `solar` y `combined` de un dispositivo son **etiquetas
administrativas**: no restringen qué bloques puede enviar. Para este prototipo, con un
solo ESP32 que atiende los tres sensores y la estación solar, la etiqueta coherente es
`combined`.
