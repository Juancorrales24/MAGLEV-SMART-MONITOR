# Ampliación futura: rapidez media del tren entre estaciones

> ## Este documento es un DISEÑO PROPUESTO. NO ESTÁ IMPLEMENTADO.
>
> No existe en el repositorio ninguna tabla, columna, campo del contrato, endpoint ni
> línea de firmware que calcule la rapidez del tren. Nada de lo descrito aquí se ha
> programado ni probado. Es una especificación para una versión posterior.
>
> **En producción no debe haber velocidades simuladas.** Mientras no exista la medición
> real, la plataforma no debe mostrar ninguna cifra de rapidez, ni estimada, ni de
> ejemplo, ni "de prueba". Un campo vacío es correcto; un número inventado invalida el
> informe.

## 1. Qué se quiere calcular

Rapidez media de un tramo:

```
v = d / t

v : rapidez media del tramo        [m/s]
d : distancia real entre las dos estaciones del tramo   [m]
t : tiempo transcurrido entre las dos detecciones       [s]
```

Conversión a kilómetros por hora:

```
v[km/h] = v[m/s] × 3.6
```

Rapidez media del recorrido completo (no es el promedio de las rapideces de los tramos):

```
v_recorrido = (d_12 + d_23) / (t_12 + t_23)
```

Promediar las dos rapideces daría un valor distinto y **equivocado** salvo que los dos
tiempos coincidan. Hay que sumar distancias y sumar tiempos.

Nota de rigor que conviene mantener en el informe: lo que se calcula es **rapidez
media** (magnitud escalar, distancia recorrida sobre tiempo), no velocidad media como
vector. Para un tramo recto y sin retrocesos ambos coinciden en módulo, pero el término
correcto para lo que mide este sistema es rapidez media.

## 2. El punto crítico: el tiempo se mide en el ESP32, no en el servidor

**Los tiempos de paso deben medirse con un temporizador monotónico local del ESP32.
Nunca con las horas de llegada de los mensajes a Vercel, ni con `created_at` de la base
de datos.**

Esto no es una preferencia de estilo: con el código actual, usar las horas del servidor
produciría un resultado falso. Las causas están en el repositorio y se pueden comprobar:

| Mecanismo real | Efecto sobre un Δt calculado en el servidor |
|---|---|
| Límite de **un mensaje nuevo por segundo y por dispositivo** (`ingest_telemetry`) | Si dos detecciones ocurren en menos de un segundo, la segunda recibe **429** y se retrasa |
| Reintentos con **espera creciente de 2 s a 60 s** (`MaglevSender.ino`) | Una muestra puede llegar hasta un minuto después de haber ocurrido |
| **Reconexión WiFi** cada 10 s | Una caída breve de red desplaza la llegada |
| Latencia de HTTPS y del alojamiento | Variable e impredecible, y distinta en cada mensaje |
| `created_at` se asigna **en la base de datos**, al recibir | No es el instante del paso del tren |
| El ESP32 **no envía `sampled_at`** hoy; el firmware no inventa esa fecha | No hay fecha de adquisición de la que partir |

Un ejemplo de la magnitud del error, puramente aritmético: si un tramo se recorre en
2 segundos reales y el segundo mensaje llega 4 segundos tarde por un reintento, el
tiempo aparente sería 6 s y la rapidez calculada quedaría **tres veces por debajo** de
la real. El dato llegó correcto; la hora de llegada no sirve para medir.

### Qué temporizador usar en el ESP32

| Opción | Características |
|---|---|
| `esp_timer_get_time()` | Microsegundos desde el arranque, entero de 64 bits, **monotónico**. No lo afecta el ajuste de hora por NTP. **Opción recomendada.** |
| `millis()` | Milisegundos desde el arranque, 32 bits sin signo. Monotónico, pero **desborda a los ~49.7 días**. Usable si las restas se hacen con aritmética sin signo, como ya hace el sketch. |
| `time(nullptr)` / hora NTP | **No usar para intervalos.** `configTime()` ajusta el reloj de pared: un salto de hora en medio de una medición la corrompe. |

Regla de implementación: el firmware guarda la marca monotónica de cada detección y
calcula **él mismo** el intervalo, o envía la marca monotónica para que el servidor
calcule la diferencia **entre marcas del mismo arranque del dispositivo**. Nunca se
restan marcas de arranques distintos: cada reinicio de la placa pone el contador a cero.

## 3. Distancias reales y configurables

Las distancias **no se codifican en el firmware**: se miden en la vía y se configuran.

| Tramo | Dato |
|---|---|
| Estación 1 → Estación 2 | `d_12`, en metros |
| Estación 2 → Estación 3 | `d_23`, en metros |

Requisitos del diseño:

- Editables desde la web por un administrador, igual que los nombres de las estaciones.
- Guardadas **en metros**, con decimales (una vía de maqueta puede medir menos de un
  metro por tramo).
- El valor debe ser la distancia **entre los puntos de detección**, no entre los centros
  de las estaciones ni entre las maquetas. Si el sensor detecta el tren 3 cm antes del
  andén, el punto de detección es ese.
- Medir con cinta métrica a lo largo de la vía, no en línea recta si hay curvas.
- Anotar la **incertidumbre** de la medida (ver `Calculos_Experimentales.md`): una
  distancia con ±1 cm de error en un tramo de 50 cm introduce un **2 %** de error en la
  rapidez, antes de cualquier otro factor.

## 4. Cambios necesarios en el contrato de datos — propuesta

El contrato actual es **estricto**: los esquemas de Zod rechazan cualquier campo
desconocido. Hoy, un mensaje con un campo de tiempo sería rechazado con **400**. Por lo
tanto, implementar esto exige cambios coordinados en cuatro lugares.

### Opción A (preferida): marca monotónica en el evento

Añadir un campo al bloque `train_status`:

| Campo propuesto | Tipo | Unidad | Nota |
|---|---|---|---|
| `monotonic_us` | entero | µs desde el arranque del ESP32 | De `esp_timer_get_time()` |
| `boot_id` | UUID | — | Generado una vez por arranque: permite saber si dos marcas son comparables |

Mensaje propuesto (**estructura, no una medición**):

```json
{
  "sample_id": "00000000-0000-4000-8000-000000000000",
  "train_status": {
    "station_number": 2,
    "detected": true,
    "monotonic_us": 123456789,
    "boot_id": "11111111-1111-4111-8111-111111111111"
  }
}
```

Ventaja: el servidor conserva el dato crudo y puede recalcular; si un evento se pierde,
no se arrastra el error. Inconveniente: hay que guardar `boot_id` y descartar los pares
de marcas de arranques distintos.

### Opción B: el tramo completo, calculado en el ESP32

Un bloque nuevo que se envía **al completar un tramo**:

| Campo propuesto | Tipo | Unidad |
|---|---|---|
| `from_station` | entero 1–3 | — |
| `to_station` | entero 1–3 | — |
| `elapsed_ms` | entero positivo | ms, medido con el temporizador monotónico |
| `trip_id` | UUID | identifica el recorrido completo |

Ventaja: un solo mensaje por tramo, menos presión sobre el límite de un mensaje por
segundo. Inconveniente: si el mensaje se pierde, el tramo se pierde; y la rapidez
depende de que el firmware esté bien.

En ambos casos hay que modificar:

1. `frontend/lib/validation.ts` — ampliar `trainSchema` o añadir un esquema nuevo.
2. `supabase/database.sql` — columnas o tablas nuevas, con sus `check`, índices, RLS y
   `grant`.
3. `supabase/functions.sql` — `ingest_telemetry` debe escribir los campos nuevos.
4. `supabase/realtime.sql` — publicar las tablas nuevas si la web debe reaccionar en vivo.
5. `frontend/lib/database.types.ts` y las vistas correspondientes.
6. `frontend/tests/validation.test.ts` y `frontend/scripts/check-sql.mjs` — pruebas del
   contrato nuevo antes de tocar el firmware.

## 5. Tablas y columnas nuevas — propuesta

### `track_segments` — distancias configurables

| Columna | Tipo | Restricción propuesta |
|---|---|---|
| `id` | uuid | clave primaria |
| `from_position` | smallint | 1 a 3 |
| `to_position` | smallint | 1 a 3, distinto de `from_position` |
| `distance_m` | double precision | mayor que 0; sugerido un máximo razonable para una maqueta |
| `distance_uncertainty_m` | double precision | ≥ 0; incertidumbre de la medida con cinta |
| `updated_at` | timestamptz | — |

Única sobre `(from_position, to_position)`. Lectura para usuarios activos; escritura solo
desde una API administrativa nueva (`PATCH /api/admin/segments`), igual que `stations`.
Dos filas iniciales: 1→2 y 2→3, **sin distancia**, para no inventar un valor.

### `trips` — recorridos

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid | clave primaria |
| `device_id` | uuid | referencia a `devices` |
| `boot_id` | uuid | arranque del ESP32 al que pertenecen las marcas |
| `started_at` | timestamptz | recepción del primer evento del recorrido |
| `finished_at` | timestamptz | nulo mientras el recorrido no termina |
| `label` | text | etiqueta del ensayo, editable desde la web |
| `notes` | text | condiciones del ensayo |

### `trip_segments` — un tramo recorrido

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid | clave primaria |
| `trip_id` | uuid | referencia a `trips`, en cascada |
| `from_position` | smallint | 1 a 3 |
| `to_position` | smallint | 1 a 3 |
| `elapsed_ms` | integer | **medido con el temporizador monotónico del ESP32** |
| `distance_m` | double precision | **copia** de la distancia vigente al registrar el tramo |
| `created_at` | timestamptz | — |

Dos decisiones de diseño que conviene justificar en el informe:

- `distance_m` se **copia** en la fila en lugar de leerse por referencia. Si alguien
  corrige la distancia de la vía después, los ensayos antiguos conservan la distancia con
  la que realmente se calcularon y siguen siendo reproducibles.
- La **rapidez no se almacena**: se deriva de `distance_m / (elapsed_ms / 1000)`, por
  ejemplo en una columna generada o en una vista. Así no puede quedar una rapidez
  incoherente con sus propios datos de origen. Si se almacenara, habría que garantizar
  que nunca se actualiza una sin la otra.

### Vista propuesta `trip_speeds`

Por tramo: `from_position`, `to_position`, `elapsed_ms`, `distance_m`, `speed_mps`,
`speed_kmh`. Y por recorrido: suma de distancias sobre suma de tiempos, en m/s y km/h.

Toda fila con `distance_m` nulo o `elapsed_ms` no positivo debe quedar **sin rapidez**
(`null`), no con un cero ni con un valor por defecto.

## 6. Historial de recorridos y comparación entre ensayos

Lo que debería ofrecer la interfaz:

- **Lista de recorridos** con fecha, etiqueta, tiempo total, distancia total y rapidez
  media del recorrido en m/s y km/h.
- **Detalle de un recorrido**: los dos tramos, con tiempo, distancia y rapidez de cada
  uno, y el total.
- **Comparación entre ensayos**: varios recorridos en una tabla y una gráfica, para ver
  la dispersión entre repeticiones del mismo experimento.
- **Exportación CSV**, como ya hace el historial actual, para los cálculos del informe.
- **Marcado explícito** de los recorridos **incompletos** (con un evento perdido o con
  marcas de arranques distintos): se muestran como incompletos, **no** se completan con
  una estimación.

## 7. Fuentes de error que el informe debe reconocer

| Fuente | Efecto |
|---|---|
| **Punto de detección ≠ punto del andén** | Desplaza sistemáticamente la distancia efectiva |
| **Ancho del haz infrarrojo** | El sensor se activa en un intervalo, no en un punto; introduce un sesgo del mismo signo en las dos estaciones, que en parte se cancela |
| **Tiempo de respuesta del módulo** | Retardo pequeño pero no nulo entre el paso y el cambio de la salida |
| **Histéresis del sensor** (`d_on` ≠ `d_off`) | Afecta más a `detected: false` que a `detected: true` |
| **Antirrebote por software** | Si el filtro es de 50 ms, el tiempo medido queda sesgado en ese orden |
| **Error de la medida de la distancia** | Se traslada directamente a la rapidez, en porcentaje |
| **Resolución del temporizador** | Con `esp_timer_get_time()` es despreciable frente a los demás |
| **Aceleración y frenado del tren** | La rapidez media de un tramo no es la rapidez instantánea en ningún punto concreto |

La buena noticia metodológica: al medir el tiempo en el propio microcontrolador, los
retardos de red **desaparecen por completo** de la medición y solo quedan los errores
físicos y de software local, que son los que se pueden acotar y reportar.

## 8. Orden sugerido de implementación

1. Medir físicamente `d_12` y `d_23` con su incertidumbre, y anotarlas.
2. Pruebas del contrato nuevo en `validation.test.ts` y `check-sql.mjs`, **antes** de
   escribir el firmware.
3. Esquema: `track_segments`, `trips`, `trip_segments`, vista, RLS, grants, Realtime.
4. API administrativa de distancias.
5. Contrato y función de ingestión.
6. Firmware: marca monotónica por evento, `boot_id` por arranque.
7. Interfaz: historial de recorridos y comparación de ensayos.
8. Validación física: cronometrar manualmente varias pasadas y comparar con lo que
   reporta el sistema. Mientras esa comparación no se haga, la cifra **no está
   verificada** y debe presentarse así.

## 9. Resumen del estado

| Elemento | Estado |
|---|---|
| Fórmula y método | Definidos en este documento |
| Decisión de usar temporizador monotónico local | Justificada con el comportamiento real del código |
| Tablas, columnas y vistas | **Propuestas. No existen.** |
| Campos del contrato JSON | **Propuestos. No existen** y hoy serían rechazados con 400 |
| Firmware de medición de tiempos | **No existe** |
| Interfaz de recorridos | **No existe** |
| Distancias reales de la vía | **No medidas** |
| Validación contra cronómetro | **No realizada** |
