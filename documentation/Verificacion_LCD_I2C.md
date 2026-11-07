# Verificación de la pantalla LCD 1602 con interfaz I2C

La LCD es una **salida local** del prototipo: muestra información junto a la vía. **La
web no recibe su contenido** y no existe ningún campo del contrato de datos asociado a
la pantalla.

Todo este documento está **[PENDIENTE DE PRUEBA FÍSICA]**. A la fecha,
`esp32/MaglevSender/MaglevSender.ino` **no contiene código de LCD**; el firmware se está
ampliando en esta misma rama, así que revisa el archivo antes de dar por hecho qué
biblioteca y qué pines usa.

## Qué hay que confirmar

| Dato | Estado |
|---|---|
| Hay una LCD 1602 con módulo de interfaz I2C | Informado por el técnico |
| **Dirección I2C** del módulo | **[POR CONFIRMAR]** — habitualmente **0x27** o **0x3F**, pero depende del expansor y de sus puentes de dirección |
| Pines **SDA** y **SCL** usados | **[POR CONFIRMAR]** — en la mayoría de placas ESP32 el bus I2C por defecto del core de Arduino es **SDA = GPIO21** y **SCL = GPIO22**, pero en el ESP32 se puede reasignar |
| Tensión de alimentación del módulo | **[POR CONFIRMAR]** — 5 V o 3.3 V |
| Biblioteca usada | La define el firmware. Ver más abajo. |

## 1. Alimentación y niveles del bus — comprobar antes de conectar

Los módulos I2C para LCD 1602 suelen llevar un expansor de puertos y **resistencias de
pull-up en SDA y SCL hacia su propio Vcc**.

> **Riesgo real:** si el módulo se alimenta a **5 V**, sus pull-up llevan SDA y SCL hacia
> 5 V. Los pines del ESP32 **no toleran más de 3.3 V**. Conectar el bus en esas
> condiciones puede dañar el microcontrolador.

Qué hacer, en este orden:

1. Alimenta el módulo **sin conectar SDA/SCL al ESP32**.
2. Con el multímetro, mide SDA a GND y SCL a GND en reposo.
3. Si la lectura está alrededor de **3.3 V**, puedes conectar el bus directamente.
4. Si está alrededor de **5 V**, **no lo conectes**: alimenta el módulo a 3.3 V (muchos
   expansores funcionan, aunque el contraste y el brillo de la retroiluminación pueden
   quedar pobres), o usa un adaptador de niveles bidireccional para I2C.
5. Anota en `Calculos_Experimentales.md` con qué tensión quedó finalmente.

Si la pantalla se alimenta a 3.3 V y no se ve nada aunque el escáner la detecte, ajusta
el **potenciómetro de contraste** del módulo antes de concluir que está averiada: con una
tensión baja el contraste suele requerir ajuste.

## 2. Encontrar la dirección I2C — escáner

No adivines entre 0x27 y 0x3F: escanea. Este es un sketch de **diagnóstico**, no el
firmware del proyecto.

```cpp
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  // Ajusta los pines si el prototipo no usa el bus por defecto de la placa.
  Wire.begin(21, 22);          // (SDA, SCL)  [POR CONFIRMAR]
  Serial.println("Buscando dispositivos en el bus I2C...");
  int encontrados = 0;
  for (uint8_t dir = 1; dir < 127; dir++) {
    Wire.beginTransmission(dir);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Dispositivo en 0x%02X\n", dir);
      encontrados++;
    }
  }
  Serial.printf("Total: %d dispositivo(s).\n", encontrados);
}

void loop() {}
```

Interpretación:

| Resultado | Qué significa |
|---|---|
| Una dirección, p. ej. 0x27 o 0x3F | Esa es la dirección del módulo. Anótala. |
| **Ninguna** dirección | SDA/SCL invertidos, módulo sin alimentación, GND no común, pines mal indicados en `Wire.begin()`, o soldadura abierta. |
| Más de una dirección | Hay otros dispositivos en el bus. Ver sección 4. |
| Direcciones cambiantes entre ejecuciones | Contacto intermitente o falta de pull-up efectivo. |

## 3. Prueba de escritura

Con la dirección confirmada, una prueba mínima de escritura. La biblioteca debe ser la
misma que use el firmware definitivo; opciones habituales para estos módulos:

- `LiquidCrystal I2C` (Frank de Brabander)
- `LiquidCrystal_PCF8574` (Matthias Hertel)
- `hd44780` (Bill Perry), que incluye sketches de diagnóstico y autodetección del
  expansor

**[POR CONFIRMAR]** cuál se adopta: el `#include` del sketch y la biblioteca instalada en
el Arduino IDE **deben coincidir**. Instálala desde *Herramientas → Gestionar
bibliotecas*, igual que ArduinoJson 7 (ver `Integracion_ESP32.md`).

Comprobaciones de la prueba de escritura:

1. Se inicializa con la dirección y el formato **16 columnas × 2 filas**.
2. Aparece el texto en la fila 1 y en la fila 2.
3. La retroiluminación se enciende y se apaga cuando se le ordena.
4. Un texto de más de 16 caracteres se corta: la pantalla **no desplaza sola**. Los
   mensajes del prototipo deben caber en 16 caracteres por fila.
5. La LCD 1602 estándar **no tiene tilde ni ñ** en su juego de caracteres: escribe los
   textos sin acentos o verifica cómo se representan antes de la sustentación.

## 4. Convivencia con otros dispositivos del bus

Características del bus I2C que afectan a este prototipo:

- Es un bus compartido: **varios dispositivos usan los mismos dos cables** (SDA y SCL),
  cada uno con su dirección.
- **Dos dispositivos con la misma dirección no pueden convivir** en el mismo bus. Si
  llegas a añadir otro módulo, escanea otra vez y confirma que las direcciones difieren.
- Los pull-up se suman: si varios módulos traen los suyos, la resistencia equivalente
  baja. Con muchos módulos o cables largos el bus puede volverse inestable.
- Los sensores infrarrojos del Sistema A **no son I2C**: son salidas digitales y no
  comparten SDA/SCL. Lo único que hay que evitar es asignarles los pines del bus.
- Los divisores del Sistema C usan **GPIO34 y GPIO35** (ADC1), que no son los pines I2C
  por defecto: no hay conflicto con el bus. **[POR CONFIRMAR]** con el circuito real.
- Si el prototipo necesitara un segundo bus, el ESP32 permite instanciar otro `TwoWire`
  con pines distintos. Hoy no hace falta.

Conviene dejar anotado el mapa final de pines para que nadie reasigne por error un pin
ya ocupado: usa la tabla de `Calculos_Experimentales.md`.

## 5. Lista de verificación

- [ ] Tensión de alimentación del módulo medida y anotada.
- [ ] Tensión en SDA y SCL en reposo medida **antes** de conectar al ESP32.
- [ ] Dirección I2C obtenida con el escáner, no supuesta.
- [ ] Pines SDA y SCL reales anotados.
- [ ] Texto visible en las dos filas, con contraste ajustado.
- [ ] Retroiluminación controlable.
- [ ] Mensajes del prototipo de 16 caracteres o menos por fila, sin acentos.
- [ ] Biblioteca instalada igual a la que incluye el firmware.
- [ ] Escaneo repetido con todos los dispositivos conectados: sin direcciones repetidas.
- [ ] Mapa de pines completo y sin conflictos con los sensores ni con el ADC.
