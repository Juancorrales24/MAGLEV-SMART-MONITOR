# Verificación eléctrica con multímetro, antes de cargar el firmware definitivo

Esta guía se sigue **con el circuito en la mano y el ESP32 todavía desconectado del
divisor**. Ninguno de estos pasos se ha ejecutado: todo este documento está
**[PENDIENTE DE PRUEBA FÍSICA]**. Las cifras que aparecen son **cálculos teóricos** con
las fórmulas del proyecto o límites de hoja de datos, **no mediciones del prototipo**.

> **Regla de oro:** no se conecta un divisor a un pin del ESP32 hasta haber medido con
> el multímetro, en el peor caso de iluminación y de carga, que la tensión en ese nodo
> es segura. La entrada del ADC **no tolera más de 3.3 V**.

Anota cada valor medido en las tablas de `Calculos_Experimentales.md`. Sin esos
registros no hay cálculo experimental que presentar.

## 0. Antes de medir

| Paso | Detalle |
|---|---|
| Multímetro en **voltaje continuo (DC)** | Nunca en corriente ni en resistencia para medir tensiones. |
| Escala | Automática, o manual en 20 V DC. |
| Punta negra | Al **GND del circuito** que estés midiendo. |
| Un solo nodo a la vez | No midas con el ESP32 conectado hasta el paso 5. |
| ESP32 desenergizado | Durante los pasos 1 a 4 el microcontrolador no debe estar alimentado desde el mismo nodo que estás midiendo, salvo donde se indique. |

## 1. Panel solar

Un panel etiquetado como **6 V nominales no está limitado a 6 V**: en **circuito
abierto** y con buena iluminación entrega bastante más. El valor nominal corresponde
aproximadamente a su punto de trabajo con carga, no a su máximo.

| Qué medir | Cómo | Qué anotar |
|---|---|---|
| **Voc** (circuito abierto) | Panel **desconectado de todo**, puntas en sus dos terminales, bajo la luz más intensa con la que vayas a demostrar | Tensión máxima real del panel |
| Voc en interior | Mismo procedimiento, con la luz del salón | Cuánto baja: define si la demostración necesita lámpara |
| Polaridad | Si la lectura sale **negativa**, las puntas (o los cables del panel) están invertidas | Qué cable es el positivo |
| Tensión con el cargador conectado | Panel conectado a la entrada del módulo | Caída respecto a Voc |

Criterios:

- Si `Voc × 47000 / 147000` supera **2.45 V**, el ADC trabajará fuera de su rango
  recomendado: la lectura será poco lineal en la parte alta. Eso corresponde a un
  `Voc` de aproximadamente **7.66 V**.
- Si `Voc × 47000 / 147000` se acerca a **3.3 V** — es decir, `Voc` cerca de
  **10.32 V** — **no conectes el divisor al ESP32** sin cambiar la relación de
  resistencias. **[POR CONFIRMAR]** con el panel real.

## 2. Batería de litio 18650

El litio no admite improvisación. Antes de cualquier medida:

| Comprobación | Qué buscar |
|---|---|
| **Polaridad** | El positivo del portapilas debe corresponder al positivo de la celda. Una celda invertida puede destruir el módulo cargador o la celda. |
| **Protección** | **[POR CONFIRMAR]** si la celda es protegida (con PCB en el extremo negativo) o desnuda, y si el módulo cargador incluye protección de descarga. Una celda desnuda en un módulo sin protección puede descargarse por debajo de su límite y quedar inservible o insegura. |
| **Tensión en reposo** | Con la celda fuera de carga y sin consumo. Esperable entre ~3.0 V y ~4.2 V. Por debajo de ~2.5 V la celda está en estado de riesgo: **no la cargues**, consúltalo antes. |
| **Hinchazón, olor, calentamiento, fuga** | Si aparece cualquiera de estas señales, la celda se retira del proyecto. No se mide, no se carga. |
| **Cortocircuito** | Nunca unas los terminales de la celda con una punta, una pinza ni un cable. |

Durante la carga, vigila que la celda no se caliente de forma anormal al tacto. No dejes
el conjunto cargando sin supervisión.

## 3. Módulo cargador HW-373

El técnico lo describe como **HW-373, tipo TP4056 o equivalente**. Eso está
**[POR VERIFICAR]**: lee la serigrafía de la placa y la marca del chip antes de aplicar
cualquier dato de hoja de datos.

| Qué comprobar | Por qué importa |
|---|---|
| Identificación real del chip | Un TP4056 y un módulo "equivalente" pueden tener tensiones de entrada y corrientes de carga distintas. |
| Si el módulo **tiene protección de descarga** | Los módulos TP4056 existen con y sin el circuito de protección. Cambia qué terminales se usan para la salida. |
| Tensión de entrada admitida | Los módulos basados en TP4056 están pensados para una entrada de ~5 V. Un panel de 6 V nominales **puede superar ese valor en circuito abierto**: hay que confirmar que la entrada real está dentro de lo que admite el módulo que tienes. |
| Qué terminales son salida | Alimentar el ESP32 desde los terminales equivocados puede dejar la celda sin protección de descarga. |
| Calentamiento | Los cargadores lineales disipan en forma de calor la diferencia entre la entrada y la tensión de la celda. Tócalo con cuidado tras unos minutos de carga. |
| Que **no** es un MPPT | Un cargador lineal no busca el punto de máxima potencia del panel: no esperes el rendimiento de un controlador solar. |

Mide y anota: tensión en la entrada del módulo con el panel conectado, y tensión en los
terminales de la celda durante la carga.

## 4. Divisores resistivos — el paso que evita destruir el ESP32

Hay **dos divisores**, uno para el panel y uno para la batería, cada uno con una
resistencia de **100 kΩ** y una de **47 kΩ**.

### 4.1 Orientación de las resistencias

La orientación correcta en este proyecto es:

```
V_ENTRADA ──[ 100 kΩ ]──┬── nodo de medida (va al ADC)
                        │
                   [ 47 kΩ ]
                        │
                       GND
```

- **Correcta** (100 kΩ arriba): `V_ADC = V_ENTRADA × 47/147 ≈ 0.320 × V_ENTRADA`.
- **Invertida** (47 kΩ arriba): `V_ADC = V_ENTRADA × 100/147 ≈ 0.680 × V_ENTRADA`.

Por qué es grave invertirlas (cálculo teórico): con un panel a 7.5 V, el divisor
invertido entrega **≈ 5.10 V** al pin del ESP32, muy por encima del límite de 3.3 V.
Además, el firmware seguiría multiplicando por `147/47`, de modo que la cifra reportada
sería unas **2.1 veces** la real.

Cómo distinguirlas con el circuito montado:

| Método | Cómo |
|---|---|
| Código de colores | 100 kΩ: marrón-negro-amarillo. 47 kΩ: amarillo-violeta-naranja. Con cuatro bandas, la cuarta es la tolerancia. |
| Ohmímetro | **Con el circuito sin alimentación**, mide cada resistencia aislada o desuelda un extremo. En el circuito montado la lectura queda falseada por el resto de la malla. |
| Prueba funcional | Aplica una tensión conocida y segura a la entrada y comprueba la relación medida (paso 4.2). Es la comprobación que realmente cuenta. |

### 4.2 Medida del nodo de salida, con el ESP32 aún desconectado

1. Deja el nodo de medida **libre** (sin conectar al ESP32).
2. Alimenta la entrada del divisor con el panel (o la batería) real.
3. Mide con el multímetro **V_ENTRADA** y **V_nodo** en ese mismo instante.
4. Calcula la relación: `V_nodo / V_ENTRADA`.

| Resultado | Interpretación |
|---|---|
| ≈ 0.32 | Orientación correcta. |
| ≈ 0.68 | **Resistencias invertidas.** Corrige antes de continuar. |
| ≈ 1.00 | Falta la resistencia inferior o el nodo está puenteado a la entrada: **peligro**. |
| ≈ 0.00 | Falta la resistencia superior, el nodo está a GND, o hay un circuito abierto. |
| Otro valor | Resistencias distintas a las previstas, soldadura fría o nodo mal tomado. Revisa antes de conectar. |

5. Repite con la **iluminación más fuerte** que vayas a usar: el caso peligroso es el
   panel en circuito abierto a plena luz, no el panel en penumbra.
6. Confirma que **V_nodo < 3.3 V siempre**, e idealmente **≤ 2.45 V**, en el peor caso.

### 4.3 Referencia común

Mide la tensión entre el **GND del ESP32** y el **GND del panel/batería**: debe ser
prácticamente **0 V**. Si no lo es, no comparten referencia y las medidas del divisor no
significan lo que parecen.

## 5. Primera conexión al ESP32

Solo cuando los pasos 1 a 4 estén anotados y dentro de límites:

1. Con todo desenergizado, conecta el nodo del divisor del **panel** al pin declarado
   como `PIN_PANEL` y el de la **batería** al declarado como `PIN_BATERIA` en
   `esp32/MaglevSender/MaglevSender.ino` (hoy `34` y `35`; **[POR CONFIRMAR]** contra el
   circuito real).
2. Energiza y abre el monitor serial a **115200 baudios**.
3. Compara, en el mismo instante, lo que reporta el firmware con lo que mide el
   multímetro en la **entrada** de cada divisor.
4. Si los dos canales están **intercambiados**, lo verás de inmediato: el canal de
   batería mostrará la tensión del panel y al revés. Corrige el cableado o las
   constantes, no "ajustes" el resultado.

## 6. Calibración de `CAL_PANEL` y `CAL_BATERIA`

Las dos constantes valen `1.0` en el código: **el sistema no está calibrado**. Con las
tolerancias de las resistencias, el factor real puede estar aproximadamente entre 2.93 y
3.35 en lugar de 3.1277.

Procedimiento, una vez que los pasos anteriores estén correctos:

```
CAL = V_multímetro(entrada del divisor) / V_reportado_por_el_firmware
```

1. Toma al menos **tres** puntos por canal, con tensiones distintas.
2. Promedia los `CAL` obtenidos.
3. Escribe el valor en `CAL_PANEL` / `CAL_BATERIA` y vuelve a cargar el firmware.
4. Repite la comparación y anota el **error porcentual** final en
   `Calculos_Experimentales.md`.

La modificación del firmware corresponde al área de `esp32/`; esta guía solo define el
procedimiento de medida y el cálculo.

## 7. Lista de verificación antes de dar por bueno el Sistema C

- [ ] `Voc` del panel medido en la iluminación de la demostración.
- [ ] Tensión de la celda en reposo medida y dentro de un rango razonable.
- [ ] Polaridad de panel, celda y módulo cargador confirmada.
- [ ] Identificación real del módulo cargador anotada.
- [ ] Relación de cada divisor medida ≈ 0.32.
- [ ] `V_nodo < 3.3 V` en el peor caso, en los dos canales.
- [ ] GND común confirmado.
- [ ] Canales no intercambiados entre panel y batería.
- [ ] `CAL_PANEL` y `CAL_BATERIA` calculados con mediciones reales.
- [ ] Error porcentual teórico vs experimental anotado.

Mientras alguna casilla siga vacía, las cifras que muestre la web son **lecturas sin
calibrar**, y así debe presentarse.
