# Presentación de cálculos experimentales para el informe académico

Este documento reúne las **fórmulas, los procedimientos y las tablas de registro** para
la parte experimental del informe de Electromagnetismo.

> ## Todas las tablas están VACÍAS a propósito.
>
> **No se ha realizado ninguna medición física.** No hay ESP32, sensores, panel, batería
> ni multímetro en el entorno donde se escribió esta documentación, ni compilador de
> Arduino. Cualquier cifra que aparezca aquí es un **cálculo teórico** obtenido de una
> fórmula, señalado como tal.
>
> **Rellenar estas tablas con valores inventados sería falsear un informe de
> laboratorio.** Si una medición no se hizo, la casilla se deja vacía y se escribe
> "pendiente".

## Índice de lo que hay que medir

| Sección | Qué requiere | Estado |
|---|---|---|
| 1 | Divisor resistivo: teórico vs experimental | Fórmula lista; **medición pendiente** |
| 2 | Voltajes reales de panel y batería | **Medición pendiente** |
| 3 | Calibración de `CAL_PANEL` y `CAL_BATERIA` | **Medición pendiente** |
| 4 | Registro de pruebas de los sensores infrarrojos | **Medición pendiente** |
| 5 | Rapidez media del tren | **No implementado** + **medición pendiente** |
| 6 | Distancia de activación magnética (Sistema B) | **Medición pendiente** |
| 7 | Mapa final de pines | **Por confirmar con el circuito** |

---

## 1. Divisor resistivo: voltaje teórico frente a experimental

### 1.1 Fórmulas

Divisor con R1 = 100 kΩ (superior) y R2 = 47 kΩ (inferior):

```
V_ADC(teórico) = V_ENTRADA × R2 / (R1 + R2) = V_ENTRADA × 47000 / 147000

FACTOR = (R1 + R2) / R2 = 147000 / 47000 ≈ 3.1277

V_ENTRADA(recuperado) = V_ADC × FACTOR
```

### 1.2 Error porcentual

```
Error (%) = | V_experimental − V_teórico | / V_teórico × 100
```

Para este proyecto conviene calcular **dos** errores distintos, porque responden a
preguntas diferentes:

**a) Error del divisor** — ¿se comporta el divisor como predice la fórmula?

```
V_ADC(teórico)      = V_ENTRADA(multímetro) × 47000 / 147000
V_ADC(experimental) = tensión medida con el multímetro en el nodo del divisor

Error_divisor (%) = | V_ADC(exp) − V_ADC(teo) | / V_ADC(teo) × 100
```

Un error alto aquí apunta a tolerancia de las resistencias, resistencias distintas a las
previstas o una conexión defectuosa.

**b) Error de la cadena completa de medición** — ¿coincide lo que reporta el sistema con
la realidad?

```
Error_sistema (%) = | V_reportado(firmware) − V_ENTRADA(multímetro) | / V_ENTRADA(multímetro) × 100
```

Un error alto aquí, con el divisor correcto, apunta al ADC: no linealidad, atenuación o
falta de calibración (`CAL_* = 1.0`).

### 1.3 Valores teóricos de referencia — NO son mediciones

Calculados únicamente con la fórmula y las resistencias nominales:

| V_ENTRADA | V_ADC teórico |
|---|---|
| 3.0 V | 0.959 V |
| 3.3 V | 1.055 V |
| 3.7 V | 1.183 V |
| 4.2 V | 1.343 V |
| 5.0 V | 1.599 V |
| 6.0 V | 1.918 V |
| 7.0 V | 2.238 V |
| 7.5 V | 2.398 V |
| 10.32 V | 3.300 V — **límite del pin, no superar** |

Efecto de la tolerancia (también teórico): con resistencias de ±5 %, `FACTOR` real queda
aproximadamente entre **2.93 y 3.35** frente a 3.1277 nominal, es decir ±7 %. Esa
dispersión es la justificación física de la calibración de la sección 3.

### 1.4 Tabla de registro — canal del PANEL (GPIO34, [POR CONFIRMAR])

| # | V_ENTRADA multímetro (V) | V_ADC teórico (V) | V_ADC multímetro (V) | Error divisor (%) | V reportado firmware (V) | Error sistema (%) |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

### 1.5 Tabla de registro — canal de la BATERÍA (GPIO35, [POR CONFIRMAR])

| # | V_ENTRADA multímetro (V) | V_ADC teórico (V) | V_ADC multímetro (V) | Error divisor (%) | V reportado firmware (V) | Error sistema (%) |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

### 1.6 Datos del montaje que hay que anotar

| Dato | Valor | Estado |
|---|---|---|
| R1 medida con ohmímetro, canal panel | | pendiente |
| R2 medida con ohmímetro, canal panel | | pendiente |
| R1 medida con ohmímetro, canal batería | | pendiente |
| R2 medida con ohmímetro, canal batería | | pendiente |
| Tolerancia marcada en las resistencias | | pendiente |
| `FACTOR` recalculado con las resistencias medidas | | pendiente |
| Modelo y exactitud declarada del multímetro | | pendiente |
| Versión del core ESP32 de Arduino instalada | | pendiente |

Con R1 y R2 medidas, el factor real se recalcula como `(R1+R2)/R2` y se puede separar el
error atribuible a la tolerancia del atribuible al ADC. Es un buen argumento para el
informe.

---

## 2. Voltajes reales del panel y de la batería

Procedimiento en `Verificacion_Electrica.md`.

### 2.1 Panel solar (6 V nominales)

Un panel de 6 V nominales **puede superar los 6 V en circuito abierto**: conviene
registrar ese dato porque es la medición que justifica el dimensionado del divisor.

| Condición | V medido (V) | Observaciones |
|---|---|---|
| Circuito abierto, luz solar directa | | pendiente |
| Circuito abierto, luz del salón | | pendiente |
| Circuito abierto, lámpara de la demostración | | pendiente |
| Conectado al módulo cargador | | pendiente |
| En penumbra | | pendiente |

### 2.2 Batería de litio 18650

| Momento | V medido (V) | `battery_level` reportado (%) | Observaciones |
|---|---|---|---|
| En reposo, antes de cargar | | | pendiente |
| Durante la carga | | | pendiente |
| Al terminar la carga | | | pendiente |
| Tras 10 min de funcionamiento | | | pendiente |
| Tras 30 min de funcionamiento | | | pendiente |

Cómo interpretar la columna del porcentaje en el informe: `battery_level` es una
**estimación a partir del voltaje** mediante una curva aproximada de descarga de celda de
litio (3.00 V → 0 %, 4.20 V → 100 %, con tramos intermedios). **No es una medición
directa del estado de carga.** Dos efectos que conviene mencionar al comparar la columna
de voltaje con la de porcentaje:

- La tensión de una celda de litio **depende de la corriente** que esté entregando o
  recibiendo: bajo carga baja y en reposo se recupera. Por eso el porcentaje puede
  "saltar" sin que la energía almacenada haya cambiado.
- La curva del firmware **no está ajustada a esta celda concreta**: es una curva genérica.

### 2.3 Módulo cargador

| Dato | Valor | Estado |
|---|---|---|
| Serigrafía de la placa | | **[POR VERIFICAR]** — declarado HW-373 |
| Marca del chip | | **[POR VERIFICAR]** — declarado tipo TP4056 o equivalente |
| ¿Incluye protección de descarga? | | pendiente |
| Tensión en la entrada con el panel conectado | | pendiente |
| Tensión en los terminales de la celda durante la carga | | pendiente |
| Indicación de los LED del módulo (carga / completa) | | pendiente |

---

## 3. Calibración de `CAL_PANEL` y `CAL_BATERIA`

En el firmware ambas valen **`1.0`**: el sistema **no está calibrado**.

```
CAL = V_ENTRADA(multímetro) / V_reportado(firmware)
```

| Canal | # | V multímetro (V) | V reportado (V) | CAL calculado |
|---|---|---|---|---|
| Panel | 1 | | | |
| Panel | 2 | | | |
| Panel | 3 | | | |
| **Panel** | **promedio** | | | |
| Batería | 1 | | | |
| Batería | 2 | | | |
| Batería | 3 | | | |
| **Batería** | **promedio** | | | |

Después de aplicar los promedios en el firmware y recargarlo, repite la tabla 1.4/1.5 y
anota el **error del sistema antes y después de calibrar**. Esa comparación es uno de los
resultados más presentables del informe.

| Canal | Error medio antes de calibrar (%) | Error medio después (%) |
|---|---|---|
| Panel | | |
| Batería | | |

---

## 4. Registro de pruebas de los sensores infrarrojos

Procedimiento en `Verificacion_Sensores_IR.md`.

### 4.1 Identificación y nivel activo

| Estación | `station_number` | Pin del ESP32 | V salida sin obstáculo (V) | V salida con obstáculo (V) | Nivel activo |
|---|---|---|---|---|---|
| 1 | 1 | | | | |
| 2 | 2 | | | | |
| 3 | 3 | | | | |

El nivel activo (bajo o alto) está **[POR CONFIRMAR]**: se determina midiendo, no se
asume.

### 4.2 Alcance de detección — cinco repeticiones por sensor

| Sensor | `d_on` 1 | 2 | 3 | 4 | 5 | `d_on` medio | `d_off` medio | Histéresis |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

Distancias en centímetros. `d_on`: distancia a la que empieza a detectar. `d_off`:
distancia a la que deja de detectar. Histéresis = `d_on − d_off`.

Condiciones que hay que anotar junto a la tabla:

| Condición | Valor |
|---|---|
| Objeto usado como blanco | |
| Color y acabado del blanco | |
| Iluminación del recinto | |
| Tensión de alimentación de los módulos | |
| Posición del potenciómetro de ajuste, si lo tienen | |

### 4.3 Detección con el tren en movimiento

| Sensor | Pasadas realizadas | Detecciones correctas | Fallos | Observaciones |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### 4.4 Falsas detecciones y ruido

| Prueba | Duración | Cambios espontáneos | Observaciones |
|---|---|---|---|
| Reposo, luz del salón | 5 min | | |
| Reposo, luz apagada | 5 min | | |
| Reposo, luz solar directa | 5 min | | |
| Rebote en una sola pasada | — | | ¿Uno o varios cambios? |
| Interferencia entre sensores vecinos | — | | |

### 4.5 Comprobación de extremo a extremo

| Prueba | Resultado | Estado |
|---|---|---|
| Paso por estación 1 → registro con `station_number = 1` | | pendiente |
| Paso por estación 2 → registro con `station_number = 2` | | pendiente |
| Paso por estación 3 → registro con `station_number = 3` | | pendiente |
| Salida del sensor → registro con `detected = false` | | pendiente |
| `last_seen` del dispositivo se actualiza | | pendiente |
| Tras 60 s sin envíos la web deja de indicar LIVE | | pendiente |

---

## 5. Rapidez media del tren

> **Esta sección depende de una funcionalidad que NO ESTÁ IMPLEMENTADA.** El diseño
> propuesto está en `Ampliacion_Rapidez_Media.md`. El sistema actual **no mide tiempos
> de paso ni calcula rapidez**.
>
> Mientras eso no exista, el tiempo se puede medir **a mano con cronómetro**, y debe
> presentarse como una **medición manual**, nunca como una salida del sistema.

### 5.1 Fórmulas

```
v = d / t                v[km/h] = v[m/s] × 3.6

v_recorrido = (d_12 + d_23) / (t_12 + t_23)
```

La rapidez media del recorrido **no es el promedio** de las rapideces de los tramos: se
suman distancias y se suman tiempos.

### 5.2 Distancias de la vía

| Tramo | Distancia medida (m) | Incertidumbre (± m) | Método |
|---|---|---|---|
| Estación 1 → 2 | | | pendiente |
| Estación 2 → 3 | | | pendiente |
| Total 1 → 3 | | | pendiente |

La distancia se mide **entre los puntos de detección de los sensores**, siguiendo el
trazado de la vía, no en línea recta.

### 5.3 Tabla de ensayos

| Ensayo | Origen del tiempo | t₁₂ (s) | v₁₂ (m/s) | v₁₂ (km/h) | t₂₃ (s) | v₂₃ (m/s) | v₂₃ (km/h) | t total (s) | v recorrido (m/s) | v recorrido (km/h) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| **Media** | | | | | | | | | | |

En **Origen del tiempo** escribe `cronómetro manual` o, si algún día se implementa,
`temporizador del ESP32`. No mezcles los dos orígenes en una misma media sin decirlo.

### 5.4 Advertencia metodológica que debe constar en el informe

**Los tiempos de paso no se pueden obtener de las horas de llegada de los mensajes al
servidor.** El sistema limita la recepción a un mensaje nuevo por segundo por dispositivo
y reintenta con esperas crecientes de 2 a 60 segundos ante fallos de red: la hora de
llegada incluye esos retrasos y no es la hora del paso del tren. Por eso el diseño
propuesto exige un **temporizador monotónico local en el ESP32**. La justificación
detallada, con los mecanismos del código que lo provocan, está en
`Ampliacion_Rapidez_Media.md`.

### 5.5 Fuentes de error a discutir

| Fuente | Magnitud estimada | Estado |
|---|---|---|
| Error de la medida de la distancia | | pendiente |
| Ancho del haz del sensor | | pendiente |
| Tiempo de respuesta del módulo | | pendiente |
| Reacción humana, si el tiempo es manual | | pendiente |
| Aceleración/frenado en el tramo | | pendiente |

---

## 6. Distancia de activación magnética (Sistema B)

El Sistema B es un **circuito independiente del ESP32**: imán, elemento magnético y LED.
**La plataforma no recibe su estado** y no debe haber lecturas ficticias de esos LED. Su
funcionamiento se demuestra físicamente.

Qué elemento magnético quedó instalado está **[POR CONFIRMAR]**.

### 6.1 Identificación

| Dato | Valor | Estado |
|---|---|---|
| Tipo de elemento magnético (interruptor *reed*, sensor de efecto Hall, otro) | | **[POR CONFIRMAR]** |
| Referencia o marca | | **[POR CONFIRMAR]** |
| Tipo de imán (neodimio, ferrita, otro) y dimensiones | | pendiente |
| Tensión de alimentación del circuito | | pendiente |
| Número de estaciones con LED instalado | | **[POR CONFIRMAR]** |

### 6.2 Distancia de activación — medición pendiente

| Estación | d activación 1 (cm) | 2 | 3 | 4 | 5 | Media | d desactivación media | Histéresis |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

Procedimiento sugerido: aproxima el imán de frente, lentamente, y anota la distancia a la
que el LED se enciende; aléjalo y anota la distancia a la que se apaga. Repite cinco
veces por estación.

Variables que cambian el resultado y que conviene registrar:

| Variable | Anotación |
|---|---|
| Orientación de los polos del imán | |
| Si el imán se acerca de frente o lateralmente | |
| Presencia de piezas metálicas cerca | |
| Tensión de alimentación | |

### 6.3 Discusión para el informe

Esta es la medición con más contenido de electromagnetismo del proyecto. Puntos que se
pueden desarrollar **una vez haya datos**:

- La intensidad del campo de un imán **decae rápidamente con la distancia**, de forma no
  lineal, lo que explica que la activación ocurra en un intervalo estrecho y bien
  definido.
- La **histéresis** entre encendido y apagado es una característica del elemento
  magnético, no un defecto del montaje.
- La **orientación de los polos** importa: un interruptor *reed* y un sensor de efecto
  Hall responden de forma distinta a la dirección del campo.
- No extrapoles una ley cuantitativa del decaimiento con cinco puntos tomados con una
  regla: discute la tendencia y reconoce la incertidumbre.

---

## 7. Mapa final de pines del ESP32 — [POR CONFIRMAR]

Rellénalo con el circuito en la mano y compáralo con lo que declare
`esp32/MaglevSender/MaglevSender.ino`. Es la tabla que evita que alguien reasigne por
error un pin ya ocupado.

| Función | Pin declarado en el código | Pin real del circuito | Comprobado |
|---|---|---|---|
| Divisor del panel (ADC) | `PIN_PANEL = 34` | | |
| Divisor de la batería (ADC) | `PIN_BATERIA = 35` | | |
| Sensor IR estación 1 | no declarado | | |
| Sensor IR estación 2 | no declarado | | |
| Sensor IR estación 3 | no declarado | | |
| LCD I2C — SDA | no declarado | | |
| LCD I2C — SCL | no declarado | | |
| Dirección I2C de la LCD | no declarada | | |

---

## 8. Resumen de estado para el informe

Tabla directamente reutilizable en la sección de alcance y limitaciones.

| Elemento | Implementado en código | Verificado con pruebas automatizadas | Probado con hardware |
|---|---|---|---|
| Contrato JSON de `train_status` (`station_number`, `detected`) | Sí | Sí | **No** |
| Contrato JSON de `solar_station` (`panel_voltage`, `battery_voltage`, `battery_level`) | Sí | Sí | **No** |
| Ingestión atómica y deduplicación por `sample_id` | Sí | Sí | **No** |
| Permisos de la base (RLS, secretos, cuentas inactivas) | Sí | Sí | **No** |
| Tabla `stations` con nombres editables | Sí | Sí (valores iniciales) | **No** |
| Transporte HTTPS con verificación TLS en el ESP32 | Sí | No aplica | **No** |
| Medida de panel y batería por ADC con divisor | Sí (en el sketch) | No aplica | **No** |
| Envío de `battery_voltage` por el firmware | **No** (lo mide pero no lo envía) | — | **No** |
| Lectura de los sensores infrarrojos en el firmware | **No** (hoy entra por el puerto serie) | — | **No** |
| Código de la LCD 1602 I2C | **No** | — | **No** |
| Calibración `CAL_PANEL` / `CAL_BATERIA` | Constantes en `1.0`, sin calibrar | — | **No** |
| Medición de corriente o potencia | **No existe en el prototipo** | — | — |
| Cálculo de rapidez media | **No implementado**; diseño propuesto | — | **No** |
| Sistema B (iluminación magnética) | **Fuera del sistema**: circuito independiente, sin telemetría | — | **No** |

Nota sobre la columna "Verificado con pruebas automatizadas": se refiere a
`frontend/tests/validation.test.ts` y `frontend/scripts/check-sql.mjs`, que se ejecutan
con `npm run check` sobre una base PostgreSQL temporal en memoria. **No son pruebas con
hardware** y no dicen nada sobre el comportamiento físico del prototipo. Ver
`Verificacion.md`.
