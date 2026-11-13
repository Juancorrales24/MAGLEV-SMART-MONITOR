# Verificación de los tres sensores infrarrojos

Objetivo: **no confiar en los sensores hasta haberlos probado**. Un evento falso o un
sensor confundido con otro produce un historial de detecciones que no corresponde al
recorrido real del tren, y eso invalida cualquier conclusión del informe.

Los tres sensores **ya funcionan en el prototipo**: presencia en nivel bajo, pines 26,
27 y 25, y antirrebote asimétrico en el firmware (20 ms de llegada, 250 ms de salida,
que absorbe el doble pulso observado en el sensor 2). Este documento queda como
referencia de diagnóstico ante falsas detecciones o un sensor que deje de responder.

## Qué sabemos y qué no

| Dato | Estado |
|---|---|
| Hay **3 sensores infrarrojos**, uno por estación | Informado por el técnico |
| Modelo concreto de los módulos | **[POR CONFIRMAR]** |
| Si la salida es **activa en bajo** o **activa en alto** | **[POR CONFIRMAR]** — no lo asumas |
| A qué pin del ESP32 quedó conectada cada estación | **[POR CONFIRMAR]** |
| Alcance de detección real | **[POR CONFIRMAR]** — se mide, no se lee de la caja |
| Contrato de datos del evento (`station_number`, `detected`) | **[IMPLEMENTADO]** y **[PRUEBAS AUTOMATIZADAS]** |
| Código de lectura de los sensores en el sketch | **No está presente** en `esp32/MaglevSender/MaglevSender.ino` a la fecha de este documento; el firmware se está ampliando en esta misma rama. Revisa el archivo antes de dar por hecho qué pines usa. |

Muchos módulos infrarrojos de obstáculo de uso común entregan la salida **en bajo**
cuando detectan, y traen un potenciómetro para ajustar el alcance; pero eso **varía
entre módulos** y no se puede dar por cierto. El paso 2 lo determina midiendo.

## Material

- Multímetro (opcional pero útil) o el propio ESP32 con un sketch de diagnóstico.
- Monitor serial a **115200 baudios**.
- Una regla o cinta métrica.
- El tren, o una pieza del mismo material y color que la parte del tren que pasa frente
  al sensor.
- Papel o cinta para tapar un sensor mientras pruebas otro.

## Paso 1 — Alimentación de cada módulo

1. Confirma la tensión de alimentación que admite cada módulo (**[POR CONFIRMAR]**:
   3.3 V, 5 V o ambas) y con qué está alimentado en el prototipo.
2. **Importante:** si un módulo se alimenta a 5 V, su pin de salida puede entregar
   niveles por encima de los 3.3 V que tolera el ESP32. Mide la salida con el multímetro
   **antes** de conectarla a un GPIO. Si supera 3.3 V, hace falta adaptación de nivel.
3. Verifica GND común entre los módulos y el ESP32.

## Paso 2 — Determinar el nivel activo (bajo o alto)

Método con multímetro, sin tocar el firmware:

1. Alimenta el módulo. Punta negra a GND, punta roja al pin de **salida**.
2. Anota la tensión **sin obstáculo** delante.
3. Pon la mano o el tren a unos pocos centímetros y anota la tensión **con obstáculo**.

| Sin obstáculo | Con obstáculo | Conclusión |
|---|---|---|
| Alta (≈ Vcc) | Baja (≈ 0 V) | **Activo en bajo**: detectar = `LOW` |
| Baja (≈ 0 V) | Alta (≈ Vcc) | **Activo en alto**: detectar = `HIGH` |
| No cambia | — | Módulo mal alimentado, mal orientado, fuera de alcance o averiado |
| Oscila sin obstáculo | — | Ver paso 5 (ruido y falsas detecciones) |

Método con el ESP32, sin lógica de negocio todavía: un sketch de diagnóstico que
imprima el estado crudo de los tres pines. Es código de prueba, **no** el firmware del
proyecto; no se envía nada a la plataforma mientras pruebas.

```cpp
// Sketch de diagnóstico. Sustituye los pines por los que realmente quedaron cableados.
const int PINES[3] = {25, 26, 27};   // [POR CONFIRMAR] con el circuito real

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 3; i++) pinMode(PINES[i], INPUT);
  Serial.println("Estado crudo de los tres sensores. Ctrl para detener.");
}

void loop() {
  for (int i = 0; i < 3; i++) {
    Serial.printf("S%d=%d  ", i + 1, digitalRead(PINES[i]));
  }
  Serial.println();
  delay(200);
}
```

Notas sobre ese sketch:

- Si usas **GPIO34, 35, 36 o 39** no hay pull-up interno disponible: con una salida de
  colector abierto la lectura quedará indefinida. En ese caso usa un pin que admita
  `INPUT_PULLUP`, o añade un pull-up externo.
- Evita **GPIO6–11** (flash) y los pines de arranque **GPIO0, 2, 12, 15**.
- Anota el resultado: nivel activo y pin de cada sensor.

## Paso 3 — Confirmar qué pin corresponde a cada estación

Esta es la prueba que evita que el panel muestre "Estación 3" cuando el tren está en la
1. Con el sketch de diagnóstico corriendo:

1. Tapa los **tres** sensores.
2. Destapa **solo el de la estación 1** y pasa el tren por delante.
3. Anota **qué índice del sketch** cambió. Ese es el pin de la estación 1.
4. Repite con las estaciones 2 y 3.
5. Comprueba que los tres resultados son **distintos**. Si dos coinciden, hay un error
   de cableado o dos sensores comparten pin.

Registra el mapa resultante en `Calculos_Experimentales.md`:

| Estación física | `station_number` del contrato | Pin del ESP32 | Nivel activo |
|---|---|---|---|
| 1 | 1 | pendiente | pendiente |
| 2 | 2 | pendiente | pendiente |
| 3 | 3 | pendiente | pendiente |

El `station_number` que viaja en el mensaje es **el número del sensor fijado por el
cableado**. El **nombre** de la estación es otra cosa: se guarda en la tabla `stations`
y se edita desde la plataforma, sin recargar el firmware (ver `Modelo_Datos.md`).

## Paso 4 — Alcance de detección

Para cada sensor, con el sketch de diagnóstico:

1. Aproxima el objeto lentamente de frente y anota la distancia a la que **empieza** a
   detectar (`d_on`).
2. Aléjalo y anota la distancia a la que **deja** de detectar (`d_off`). La diferencia
   entre ambas es la histéresis del módulo: es normal que no sean iguales.
3. Repite **cinco veces** por sensor y anota el rango de valores, no un solo número.
4. Repite con el **tren real** pasando a su velocidad habitual: un objeto que pasa rápido
   puede no activar el sensor aunque sí lo haga quieto.
5. Si el módulo tiene potenciómetro de ajuste, documenta en qué posición quedó y no lo
   muevas después de calibrar.

Factores que cambian el alcance y que conviene anotar:

- Color y acabado de la superficie del tren (una superficie oscura o mate refleja menos
  infrarrojo que una clara o brillante).
- Iluminación del salón: **la luz solar directa y algunas lámparas emiten infrarrojo** y
  pueden saturar o cegar el sensor.
- Ángulo entre el sensor y el paso del tren.
- Tensión de alimentación.

## Paso 5 — Falsas detecciones por ruido

Una falsa detección es un evento que la plataforma guardará como real. Procedimiento:

1. **Reposo largo:** deja el sketch corriendo **5 minutos sin mover nada** y observa si
   algún sensor cambia de estado por sí solo. Cualquier cambio es ruido.
2. **Rebote mecánico/eléctrico:** pasa el tren una vez y observa si se registran varios
   cambios seguidos en pocos milisegundos en lugar de uno.
3. **Interferencia de luz:** repite con la luz del salón encendida, apagada y, si aplica,
   con luz solar entrando. Anota si el comportamiento cambia.
4. **Interferencia entre sensores:** con los tres destapados, comprueba si activar uno
   afecta a sus vecinos (emisores apuntando a sensores contiguos).
5. **Cableado:** cables largos sin apantallar junto a la alimentación favorecen el ruido.
   Prueba acortándolos o separándolos.

Qué hacer con lo que encuentres:

| Síntoma | Medida |
|---|---|
| Varios cambios en milisegundos por un solo paso | Antirrebote por software (ignorar cambios durante un intervalo mínimo) o filtro en el módulo |
| Cambios espontáneos en reposo | Revisar alimentación, pull-up, apantallamiento y luz ambiente |
| Depende de la luz del salón | Apantallar el sensor del exterior; fijar las condiciones de iluminación de la demostración |
| Dos sensores se activan juntos | Separar o apantallar; revisar el ángulo de los emisores |

> El filtrado antirrebote y la lógica de llegada/salida corresponden al **firmware**
> (área de `esp32/`). Esta guía define cómo **detectar** el problema y qué anotar. La
> API acepta tanto `detected: true` como `detected: false` como eventos válidos y
> **ambos quedan registrados**: no hay un filtro posterior que descarte un evento falso.

## Paso 6 — Comprobación de extremo a extremo

Solo después de los pasos anteriores, y con el firmware definitivo configurado según
`Integracion_ESP32.md`:

1. Pasa el tren por la estación 1 y comprueba que aparece un registro nuevo con
   `station_number = 1`.
2. Repite con 2 y 3 y confirma que el número coincide con la estación física.
3. Comprueba que `detected = false` aparece cuando el tren sale del campo del sensor.
4. Verifica que `last_seen` del dispositivo se actualiza y que la web deja de indicar
   espera.

Limitación real del sistema que afecta a esta prueba: la API acepta **un mensaje nuevo
cada 400 ms por dispositivo**; un mensaje demasiado seguido recibe **429** y el emisor
lo reintenta a los 600 ms desde su cola. Si el tren pasa por dos sensores muy seguidos,
los eventos **no se pierden pero pueden llegar con retraso**. Tenlo en cuenta antes de
concluir que un sensor falló. Ver `Modelo_Datos.md`.

## Lista de verificación

- [ ] Tensión de alimentación de los módulos confirmada.
- [ ] Salida de cada módulo medida por debajo de 3.3 V antes de conectarla al ESP32.
- [ ] Nivel activo (bajo o alto) determinado por medición.
- [ ] Pin de cada estación confirmado uno por uno, con los otros tapados.
- [ ] Los tres pines son distintos.
- [ ] `d_on` y `d_off` medidos cinco veces por sensor.
- [ ] Prueba con el tren en movimiento, no solo con el objeto quieto.
- [ ] Cinco minutos en reposo sin cambios espontáneos.
- [ ] Comportamiento verificado con la iluminación de la demostración.
- [ ] Recorrido completo reflejado correctamente en la plataforma.
