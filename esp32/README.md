# Firmware del ESP32 (emisor de telemetría)

El prototipo **ya no usa levitación magnética**: el tren va sobre ruedas y su paso se
detecta con tres sensores infrarrojos, uno por estación.

## Qué hace el firmware ahora

1. **Tres sensores infrarrojos (uno por estación).** Lee las tres entradas digitales,
   filtra rebotes y emite **un solo evento por transición** — ni uno más mientras el
   tren siga delante del mismo sensor. Cada evento viaja como
   `train_status: { station_number: 1|2|3, detected: true|false }`
   (`true` = entró al alcance del sensor, `false` = salió).
2. **Estación solar.** Mide el panel y la batería por ADC con un divisor resistivo y
   envía `solar_station: { panel_voltage, battery_voltage, battery_level }` cada
   `SOLAR_INTERVALO_MS` (5 s por defecto). `battery_level` es una **estimación** a
   partir del voltaje en reposo con una curva Li-ion, no una medida directa de carga.
   No se envían `panel_current` ni `power_output`: **no hay sensor de corriente**.
3. **Cola FIFO de mensajes** en RAM, para no perder detecciones cuando llegan varias
   seguidas o la red se cae.
4. **Pantalla LCD 1602 por I2C.** Muestra `ESTACION 2` mientras el sensor de esa
   estación está activo, y la retiene **5 segundos tras la salida** (`RETENCION_ESTACION_MS`)
   antes de volver a `SIN OBSTACULOS`; si otro sensor se activa antes de que expire, lo
   reemplaza de inmediato. Si dos sensores están activos a la vez, se muestra el de
   **menor número de estación** (prioridad 1 > 2 > 3) — esa prioridad es solo para lo que
   se ve en LCD/web local, **no** afecta qué eventos se envían a Supabase: cada sensor
   sigue reportando sus propias llegadas y salidas de forma independiente.
5. **Web local por WiFi propio del ESP32** (`AP_SSID`/`AP_PASSWORD`, por defecto
   `MAGLEV-MONITOR` / `Maglev2026`), en `http://192.168.4.1`. Muestra paneles, batería,
   estado de las tres estaciones y el JSON crudo en `/datos`. **Funciona sin WiFi del
   router ni credenciales de Supabase**: es el modo de prueba de banco sin conexión a
   internet.
6. **Entrega HTTPS** a `POST /api/ingest` con verificación TLS real (`setCACert`, nunca
   `setInsecure()`), hora por NTP para comprobar la vigencia del certificado,
   `Authorization: Bearer DEVICE_TOKEN`, `X-Device-Id` y un `sample_id` UUID v4 por
   mensaje. Se activa sola (`cloudConfigurada`) solo cuando `WIFI_SSID`, `DEVICE_ID`,
   `DEVICE_TOKEN`, `ROOT_CA` y un `API_URL` con `https://` están completos en `config.h`;
   si falta algo, el ESP32 arranca igual en modo local y lo dice por Serial, en vez de
   quedarse colgado en el arranque.
7. **Entrada JSON por Serial**, una línea por mensaje, para bloques que el ESP32 no mide
   (p. ej. `measurements`). El firmware no simula ni rellena nada: solo transporta lo
   que lee de sus pines o recibe por Serial.

## Instalación

1. Abre `MaglevSender/MaglevSender.ino` con el Arduino IDE.
2. Instala el soporte de placa **esp32** de Espressif (Gestor de tarjetas). Probado
   contra la API del core **2.x y 3.x**.
3. Instala las bibliotecas (Herramientas > Gestionar bibliotecas):
   - **ArduinoJson** de Benoît Blanchon, **versión 7.x** (verificado con 7.2.0). El
     código usa la API de la 7 (`JsonDocument` elástico, `to<JsonObject>()`): **no
     compila con la 6.x**.
   - **LiquidCrystal I2C** de **Frank de Brabander**, versión **1.1.2** (la que aparece
     como «LiquidCrystal I2C» en el Gestor de bibliotecas). Si no la tienes o no quieres
     usar pantalla, pon `#define LCD_ENABLED 0` en `config.h`: el resto del firmware
     compila y funciona igual, solo se queda sin LCD.
   - `WiFi`, `WiFiClientSecure`, `HTTPClient` y `Wire` vienen con el core del ESP32.
4. Copia `MaglevSender/config.h.example` a `MaglevSender/config.h` y rellénalo. **No
   subas `config.h` al repositorio.** Ahí no van claves de Supabase: el ESP32 solo
   conoce su `DEVICE_ID` y su `DEVICE_TOKEN`.
5. Si tenías un `config.h` de una versión anterior, vuelve a copiarlo del ejemplo: le
   faltan las constantes nuevas y la compilación se detiene con un `#error` que lo dice
   — **excepto** `AP_SSID`/`AP_PASSWORD` (red local nueva): si solo faltan esas dos, el
   error del compilador es menos claro (`'AP_SSID' was not declared`); si lo ves,
   añádelas a mano desde `config.h.example`.

## Decisiones de diseño

### Antirrebote y detección
- Máquina de estados por estación: la transición solo se da por buena cuando el nivel
  se mantiene `IR_ANTIRREBOTE_MS` (20 ms por defecto). **Contrapartida real:** una
  presencia o una ausencia más corta que ese tiempo no se notifica, así que ese valor
  es el límite inferior del paso del tren por el sensor. Hay que ajustarlo con el tren
  en marcha.
- El **nivel activo** es configurable por estación (`IR_ACTIVO_EN_BAJO`): muchos
  módulos IR entregan `LOW` al detectar, pero no todos, y no se asume ninguno.
- **Dos sensores activos a la vez** funcionan: cada estación tiene su propio estado y
  emite su propio evento.
- **Tras un reinicio o un corte de alimentación** el firmware lee el estado inicial de
  los tres pines, lo imprime por Serial y **no** emite eventos por él: lo que pasó
  mientras estaba apagado no se puede saber, y emitir una llegada falsa en cada
  arranque sería inventar una medición. Consecuencia conocida: si el tren estaba
  delante de un sensor al arrancar, el panel verá su `detected:false` sin el
  `detected:true` correspondiente.
- Cada transición queda registrada con un **temporizador monotónico local**
  (`millis()`), con restas sobre `unsigned long` que siguen siendo correctas cuando
  desborda (cada ~49,7 días). Se imprime por Serial el tiempo entre llegadas, por
  estación y entre estaciones. Es la materia prima de un cálculo futuro de rapidez
  media: **aquí no se calcula ni se envía ninguna velocidad**.

### Cola de mensajes
- FIFO de `COLA_RANURAS` (16) ranuras de `COLA_BYTES_POR_RANURA` (384 B) en RAM
  **estática**, sin `malloc`, para no fragmentar el heap que necesita el handshake TLS.
  Son unos **6,2 KiB**: el ESP32 tiene 320 KiB de DRAM y deja ~150-200 KiB de heap con
  WiFi y TLS activos. A 1 mensaje/s cubre ~16 s de atasco de red.
- El `sample_id` se fija al encolar y viaja dentro de la ranura, así que **todos los
  reintentos reenvían el mismo**: si la respuesta se pierde pero el servidor ya la
  guardó, el reintento recibe un 200 (duplicada) y no se duplica el registro.
- Respeta el **límite de 1 mensaje nuevo por segundo** de la API: `INTERVALO_MIN_ENVIO_MS`
  (1200 ms) contados **desde que termina** el POST, que es más conservador que la
  ventana del servidor. Un 429 se reintenta con espera fija; un 5xx o un error de red,
  con backoff exponencial hasta 60 s; un 4xx definitivo (400, 401, 403, 413, 415)
  descarta el mensaje **informándolo por Serial**.
- Las muestras solares se limitan a `COLA_MAX_SOLAR_EN_ESPERA` (3) en espera: son
  periódicas y la siguiente sustituye a la anterior, así que un corte de red no debe
  llenar la cola y dejar sin sitio a los eventos de tren, que son irrepetibles.
- Si la cola se llena de eventos de tren, se descarta **el más antiguo** para no perder
  la detección nueva, y se imprime por Serial el mensaje descartado y el total
  acumulado. **Nunca se descarta nada en silencio.** Riesgo conocido: puede desaparecer
  una llegada y sobrevivir su salida.

### El POST sí bloquea: lo que se hace y lo que no
`HTTPClient` es bloqueante, así que durante un envío (hasta ~10 s de handshake + 8 s de
respuesta en el peor caso) `loop()` **no corre**. Esto no se puede eliminar sin mover el
envío a otra tarea de FreeRTOS. Lo que sí se hace:

- Una **interrupción por flanco** (`CHANGE`) en cada pin IR guarda nivel, instante
  (`millis()`) y número de flancos. Al volver del POST, el firmware usa el **instante
  real del flanco** en lugar del momento en que pudo mirar, así que una llegada ocurrida
  durante el bloqueo se registra con su hora correcta y no se pierde.
- Se acotan los tiempos (`TLS_HANDSHAKE_S`, `HTTP_TIMEOUT_MS`), no se intenta enviar sin
  WiFi ni sin hora válida, se lee Serial con un presupuesto de bytes por vuelta, y se
  revisan los sensores justo al volver del POST y justo después del muestreo ADC.
- **Limitación que queda:** la interrupción guarda solo el último flanco. Si el tren
  llega **y** sale completamente dentro del bloqueo, ese paso no se puede reconstruir;
  el firmware lo detecta (dos o más flancos sin cambio neto de estado) y lo avisa por
  Serial en vez de callarlo.
- **Limitación que queda:** no se envía `sampled_at`. Los eventos que salen de la cola
  después de un corte quedan sellados por el servidor con la hora de **recepción**, no
  con la de la detección, así que en el panel aparecerán agrupados en el momento de la
  reconexión.

### LCD
- Dirección I2C, pines SDA/SCL y tiempos son configurables. Lo habitual es **0x27 o
  0x3F**, pero **no se puede afirmar cuál sin probar el módulo**: si nadie responde en
  la dirección configurada, el firmware escanea el bus y lista por Serial las
  direcciones que encuentra para ajustar `LCD_DIRECCION_I2C`. Si la pantalla no
  responde, se desactiva sola y el resto sigue funcionando.
- Se escriben solo las líneas que cambian (sin `lcd.clear()`), así que no parpadea. Un
  evento se mantiene en pantalla al menos `LCD_MS_MINIMO_EVENTO` (1,2 s) para que se
  pueda leer; si llegan dos eventos muy seguidos solo se pinta el último, aunque los dos
  quedan en el log Serial.

## PENDIENTE DE PRUEBA FÍSICA

**No hay hardware disponible ni compilador de Arduino en el entorno donde se escribió
esto.** Nada de lo siguiente está comprobado sobre el prototipo:

- **Pines de los tres sensores IR** (`IR_PIN_ESTACION_1/2/3`, por defecto GPIO 25, 26 y
  27): hay que confirmarlos con el cableado real y comprobar qué pin corresponde a qué
  estación. Evitar GPIO 6-11 (flash), 0/2/12/15 (strapping) y 34-39 (solo entrada).
  GPIO 34 y 35 ya los usa el ADC solar; 21 y 22, la LCD.
- **Nivel activo de cada sensor** (`IR_ACTIVO_EN_BAJO`): medir la salida de cada módulo
  con y sin obstáculo. Si están al revés, el firmware emitirá las llegadas y las salidas
  intercambiadas.
- **Modo de entrada** (`IR_MODO_ENTRADA`): `INPUT` vale para módulos con salida de
  comparador; hace falta `INPUT_PULLUP` si la salida es de colector abierto.
- **`IR_ANTIRREBOTE_MS`**: ajustar con el tren en marcha. Demasiado bajo da detecciones
  falsas por ruido; demasiado alto pierde pasos rápidos.
- **Dirección I2C y pines SDA/SCL de la LCD**, y que el contraste del potenciómetro del
  módulo permita leer algo.
- **Calibración del ADC** (`CAL_PANEL`, `CAL_BATERIA`, `DIVISOR_R1_OHM`,
  `DIVISOR_R2_OHM`): comparar con un multímetro y ajustar. Casi nunca sale 1.0 exacto
  por la tolerancia de las resistencias y la no linealidad del ADC del ESP32.
- **Curva de porcentaje de batería**: es una aproximación genérica de celda Li-ion en
  reposo; se desplaza con la corriente y la temperatura.
- **Estabilidad del handshake TLS con esta pila**. El sketch sube la pila de `loop()` a
  12 KiB (`SET_LOOP_TASK_STACK_SIZE`) porque mbedTLS gasta varios KiB; si aun así
  aparecen reinicios por desbordamiento de pila, subir ese valor.
- **Comportamiento real ante reconexión WiFi, reinicio y corte de alimentación**, y el
  ritmo efectivo frente al límite de 1 mensaje/s de la API.

### Qué sí se verificó (sin hardware)

El firmware se compiló con `g++ -Wall -Wextra` contra **ArduinoJson 7.2.0 real** y
cabeceras mínimas del core, con y sin LCD, sin avisos; y se ejercitó la lógica nueva con
un arnés de pruebas que comprueba el orden FIFO de la cola, el descarte del más antiguo
al llenarse, el tope de muestras solares, el rechazo de mensajes demasiado grandes, que
el estado inicial no genera eventos, el antirrebote, que no hay eventos repetidos
mientras el tren sigue delante del sensor, que un rebote corto no produce una salida
falsa, dos sensores activos a la vez, el camino de la interrupción con `loop()` bloqueado
y la aritmética a través del desbordamiento de `millis()`. **Eso valida la lógica y la
API usada, no el circuito:** cualquier afirmación sobre los sensores, la pantalla o los
voltajes sigue pendiente de la prueba física.
