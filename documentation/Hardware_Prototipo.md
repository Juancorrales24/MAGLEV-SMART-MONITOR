> **ACLARACIÓN DE VERSIÓN:** El firmware actualizado sí integra GPIO 25/26/27, LCD I²C y monitor local. La descripción de funcionalidades pendientes de algunas secciones de este documento es histórica. Consulta [la guía actual](GUIA_PASO_A_PASO_ESP32_MAGLEV.md).

# Hardware del prototipo real

Este documento describe el prototipo **tal como lo construyó el técnico**, no el diseño
original del proyecto. Es la referencia de hardware para el resto de la documentación.

## Cambio respecto al diseño original

El prototipo **ya no usa levitación magnética**. El tren es un tren convencional que
circula **sobre ruedas, sobre rieles convencionales**. Por lo tanto:

- No hay altura de levitación, ni estabilidad magnética, ni temperatura de levitación
  como mediciones activas.
- El paso del tren se detecta con **sensores infrarrojos**, uno por estación.
- El nombre del proyecto y del repositorio (`MAGLEV SMART MONITOR`) se conserva por
  continuidad académica, pero no describe el principio físico del prototipo entregado.

En la base de datos y en los tipos siguen existiendo columnas y campos de la versión
anterior (`levitation_height`, `stability`, `temperature`, `panel_current`,
`power_output`, y la tabla `measurements` completa). Están ahí **por compatibilidad**,
para no destruir registros antiguos: **no son lecturas del prototipo actual** y el
firmware no las produce. Ver `Modelo_Datos.md`.

## Convenciones de estado usadas en toda la documentación

| Marca | Significado |
|---|---|
| **[IMPLEMENTADO]** | Existe en el código de este repositorio y se puede leer en los archivos citados. |
| **[PRUEBAS AUTOMATIZADAS]** | Cubierto por `frontend/tests/validation.test.ts` o `frontend/scripts/check-sql.mjs`. No es una prueba con hardware. |
| **[PENDIENTE DE PRUEBA FÍSICA]** | Nunca se ha ejecutado con el circuito real. No hay ESP32, sensores ni instrumentos disponibles en el entorno donde se escribió esta documentación, ni compilador de Arduino. |
| **[POR CONFIRMAR]** | Dato del prototipo informado por el técnico que debe comprobarse con el circuito en la mano antes de darlo por cierto. |

> **Nada de lo descrito aquí se ha probado con hardware real.** Todas las cifras
> eléctricas que aparecen en esta documentación son **cálculos teóricos a partir de las
> fórmulas**, o **rangos de validación del software**. No son mediciones.

---

## Sistema A — Detección ferroviaria

| Elemento | Cantidad | Notas |
|---|---|---|
| Tren convencional sobre rieles | 1 | Tracción propia del modelo; el sistema no la controla. |
| Estaciones físicas | 3 | Numeradas 1, 2 y 3. El número lo fija el **cableado del sensor**. |
| Sensores infrarrojos | 3 | Uno por estación. Modelo **[POR CONFIRMAR]**. |
| ESP32 | 1 | Con WiFi. Modelo concreto de placa **[POR CONFIRMAR]**. |
| Pantalla LCD 1602 con interfaz I2C | 1 | Dirección I2C **[POR CONFIRMAR]** (habitualmente 0x27 o 0x3F). |
| WiFi | — | Red del salón o punto de acceso propio. Ver `Demostracion.md`. |

Qué hace el sistema con esto:

- Cada paso del tren frente a un sensor genera un **evento** `train_status` con
  `station_number` (1–3) y `detected` (`true` = llegada/presencia, `false` = salida).
  El contrato está **[IMPLEMENTADO]** y **[PRUEBAS AUTOMATIZADAS]** en la API y la base.
- Los **nombres** de las tres estaciones se guardan en la tabla `stations` y se pueden
  editar desde la plataforma. El firmware **nunca envía el nombre**, solo el número:
  renombrar una estación no obliga a recargar el firmware. **[IMPLEMENTADO]**
- La LCD 1602 es una salida **local** del prototipo. La web no recibe su contenido.

### Pines del Sistema A — [POR CONFIRMAR]

A la fecha de este documento, el sketch `esp32/MaglevSender/MaglevSender.ino`
**no declara pines de sensores infrarrojos ni código de LCD**. El firmware se está
ampliando en esta misma rama, así que antes de cablear:

1. Abre `esp32/MaglevSender/MaglevSender.ino` y busca las constantes de pines.
2. Si no están, el bloque `train_status` se puede alimentar por el **puerto serie** con
   una línea JSON (ver `Integracion_ESP32.md`), que es la vía documentada y existente.
3. Anota en la tabla de `Calculos_Experimentales.md` qué pin quedó en cada estación.

Consideraciones de elección de pines en ESP32 (datos generales del chip, útiles para
decidir con el circuito delante):

- **GPIO34, 35, 36 y 39 son solo de entrada** y **no tienen resistencias internas de
  pull-up/pull-down**. Si la salida del sensor es de colector abierto necesitará un
  pull-up externo: no uses esos pines para ese caso.
- **GPIO6–11** están ocupados por la memoria flash de la placa: no se usan.
- **GPIO0, 2, 12 y 15** son pines de arranque (*strapping*): un sensor conectado ahí
  puede impedir que la placa arranque o que entre en modo de carga.
- Los canales de **ADC2** (entre ellos GPIO0, 2, 4, 12–15, 25–27) **no se pueden leer
  mientras el WiFi está activo**. Por eso las medidas analógicas van en ADC1.

## Sistema B — Iluminación magnética (circuito independiente)

| Elemento | Notas |
|---|---|
| Sensores o interruptores magnéticos + imanes | Qué quedó instalado: **[POR CONFIRMAR]** |
| LED de iluminación de estaciones | Encendido local |

Características que definen este sistema y que **deben decirse así en la sustentación**:

- Es un **circuito independiente del ESP32**. No pasa por el microcontrolador.
- **La web no recibe el estado de esos LED.** No existe ningún campo del contrato de
  datos que los represente, y **no debe inventarse una lectura ficticia** para
  mostrarlos en el panel.
- Su funcionamiento **se demuestra físicamente**: acercando el imán y mostrando que el
  LED de la estación se enciende.
- Qué elemento magnético quedó montado (interruptor *reed*, sensor de efecto Hall tipo
  módulo digital, u otro) está **[POR CONFIRMAR]**. La distancia de activación solo se
  puede reportar cuando se mida físicamente: ver `Calculos_Experimentales.md`.

## Sistema C — Estación solar

| Elemento | Valor declarado | Estado |
|---|---|---|
| Panel solar | 6 V **nominales** | Un panel de 6 V nominales **puede superar los 6 V en circuito abierto**. Ver `Verificacion_Electrica.md`. |
| Batería de litio | 18650 | Nominal 3.7 V; típicamente 4.2 V a plena carga y ~3.0 V de corte. **[POR CONFIRMAR]** si la celda es protegida. |
| Módulo cargador | HW-373 | Descrito como **tipo TP4056 o equivalente**: **[POR VERIFICAR]** contra la serigrafía y el chip real del módulo. |
| ESP32 con placa de expansión | 1 | **[POR CONFIRMAR]** qué alimenta la placa de expansión y con qué regulador. |
| Resistencias | 2 × 100 kΩ, 2 × 47 kΩ | Dos divisores resistivos, uno por canal medido. |
| Cables | — | — |

Qué **sí** mide y qué **no**:

- Mide **voltaje del panel** y **voltaje de la batería**, cada uno con su divisor
  resistivo, por el ADC del ESP32. **[IMPLEMENTADO]** en el sketch.
- **No mide corriente.** No hay INA219 ni sensor equivalente en el prototipo. Por lo
  tanto **no hay potencia medida**: `panel_current` y `power_output` existen en el
  esquema por compatibilidad y el prototipo los deja en `null`.
- El **porcentaje de batería** (`battery_level`) es una **estimación a partir del
  voltaje** mediante una curva aproximada de descarga de celda de litio, no una
  medición directa del estado de carga. Ver `Modelo_Datos.md`.

### Pines del Sistema C — declarados en el código, [POR CONFIRMAR] en el circuito

En `esp32/MaglevSender/MaglevSender.ino` están declarados:

| Constante | Valor en el código | Función |
|---|---|---|
| `PIN_PANEL` | `34` | Entrada ADC del divisor del **panel** |
| `PIN_BATERIA` | `35` | Entrada ADC del divisor de la **batería** |
| `R1` | `100000.0` | Resistencia superior del divisor (Ω) |
| `R2` | `47000.0` | Resistencia inferior del divisor (Ω) |
| `FACTOR_DIVISOR` | `(R1 + R2) / R2` | Factor de recuperación |
| `CAL_PANEL`, `CAL_BATERIA` | `1.0` | Factores de calibración, sin calibrar todavía |
| `SAMPLE_INTERVAL_MS` | `5000` | Intervalo de muestreo solar (ms) |

GPIO34 y GPIO35 pertenecen a **ADC1**, que sí se puede leer con el WiFi activo; esa es
la razón técnica de que sean una elección coherente para estas dos medidas.

**Esto es lo que dice el código, no una verificación del circuito.** Antes de cargar el
firmware definitivo hay que comprobar con el circuito físico que el divisor del panel
está realmente en GPIO34 y el de la batería en GPIO35, y no al contrario. El
procedimiento está en `Verificacion_Electrica.md`.

### El divisor resistivo

```
V_ENTRADA ──[ R1 = 100 kΩ ]──┬── a la entrada ADC del ESP32
                             │
                        [ R2 = 47 kΩ ]
                             │
                            GND  (común con el GND del ESP32)
```

Fórmulas del proyecto:

```
V_ADC     = V_ENTRADA × 47000 / 147000
FACTOR    = 147000 / 47000
V_ENTRADA = V_ADC × FACTOR
```

Con los valores nominales, `FACTOR ≈ 3.1277` y `V_ADC ≈ 0.3197 × V_ENTRADA`.

> El GND del panel, el de la batería y el del ESP32 **deben ser el mismo nodo**. Un
> divisor sin referencia común no mide lo que parece medir.

### Cómo lee el firmware estos canales — [IMPLEMENTADO]

| Qué hace | Dónde |
|---|---|
| `analogReadResolution(12)` → lecturas crudas de 0 a 4095 | `setup()` |
| `analogSetPinAttenuation(pin, ADC_11db)` en los dos pines | `setup()` |
| Promedia **20 lecturas** de `analogReadMilliVolts()` con 2 ms entre ellas | `leerVoltaje()` |
| Multiplica por `FACTOR_DIVISOR` y por el factor de calibración | `leerVoltaje()` |
| Estima el porcentaje con una curva por tramos de 3.00 V a 4.20 V | `porcentajeBateria()` |
| Arma el bloque `solar_station` cada 5 s y lo entrega al transporte | `sampleSolarStation()` |

**Discrepancia detectada y pendiente:** el sketch mide el voltaje de la batería y lo usa
para estimar el porcentaje, pero en el mensaje solo incluye `panel_voltage` y
`battery_level`: **no envía `battery_voltage`**, aunque el contrato, la validación, la
función de ingestión y la columna de la base ya lo aceptan. Mientras eso no cambie, la
columna `battery_voltage` quedará en `null` para las muestras del prototipo.

### Límites eléctricos del ADC que no se deben ignorar

- La entrada del ADC del ESP32 **no tolera más de 3.3 V**. Es el límite del pin, no una
  recomendación.
- `ADC_11db` es la mayor atenuación disponible. La documentación de Espressif indica,
  para el ESP32, un rango de entrada recomendado de aproximadamente **150 mV a 2450 mV**
  con esa atenuación, con no linealidad creciente fuera de ese intervalo.
  **[POR CONFIRMAR]** contra la documentación de la versión del core que instales.
- `analogReadMilliVolts()` aplica la curva de calibración de fábrica de la placa cuando
  está grabada; aun así, la linealidad real de **este** circuito solo se conoce
  comparando con un multímetro. Ver `Calculos_Experimentales.md`.

Cálculos teóricos con el divisor nominal (**no son mediciones**):

| V_ENTRADA | V_ADC teórico | Comentario |
|---|---|---|
| 3.0 V (batería baja) | 0.959 V | Dentro del rango recomendado |
| 3.7 V (batería nominal) | 1.183 V | Dentro del rango recomendado |
| 4.2 V (batería llena) | 1.343 V | Dentro del rango recomendado |
| 6.0 V (panel nominal) | 1.918 V | Dentro del rango recomendado |
| 7.5 V (panel en circuito abierto, orden de magnitud) | 2.398 V | Cerca del límite recomendado de 2.45 V |
| 10.32 V | 3.300 V | **Límite absoluto del pin: no superar** |

Corriente que consume cada divisor (teórica): a 4.2 V, 4.2 / 147 kΩ ≈ **29 µA**; a
7.5 V, ≈ **51 µA**. Es poca, pero el divisor de la batería **drena permanentemente**
mientras esté conectado.

Tolerancia: con resistencias de ±5 % en ambas posiciones, el factor real queda
aproximadamente entre **2.93 y 3.35** en lugar de 3.1277 (±7 %). Esa es la razón de que
existan `CAL_PANEL` y `CAL_BATERIA`, y de que haya que calibrar antes de dar una cifra
por buena.

## Qué queda fuera del alcance del sistema

- El sistema **no controla** el tren: ni tracción, ni frenado, ni desvíos.
- El sistema **no mide corriente ni potencia** del prototipo.
- El sistema **no conoce** el estado de los LED del Sistema B.
- El sistema **no calcula rapidez** del tren. Hay un **diseño propuesto, no
  implementado**, en `Ampliacion_Rapidez_Media.md`.

## Orden de lectura recomendado con el hardware en la mano

1. `Verificacion_Electrica.md` — multímetro, **antes** de cargar el firmware definitivo.
2. `Verificacion_LCD_I2C.md` — dirección y bus I2C.
3. `Verificacion_Sensores_IR.md` — nivel activo, alcance, pin por estación, ruido.
4. `Integracion_ESP32.md` — registro del dispositivo, `config.h` y carga del firmware.
5. `Demostracion.md` — puesta en marcha el día de la sustentación.
