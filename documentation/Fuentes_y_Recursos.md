# Fuentes técnicas y recursos

> Las direcciones web cambian con el tiempo. Antes de citarlas en el informe, **ábrelas y
> comprueba que siguen vigentes**, y cita la versión de la documentación que consultaste.

## Plataforma web y base de datos

- Next.js, instalación y App Router: https://nextjs.org/docs/app/getting-started/installation
- Supabase, cambios de PostgreSQL mediante Realtime: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, creación administrativa de usuarios: https://supabase.com/docs/reference/javascript/auth-admin-createuser

## Firmware y ESP32

- Espressif, instalación del core Arduino para ESP32: https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html
- URL del gestor de placas: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
- Espressif, WiFi en Arduino ESP32: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html
- Espressif, API del ADC en Arduino ESP32 (`analogReadMilliVolts`, resolución, atenuación): https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html
- Espressif, temporizador de alta resolución `esp_timer` — base del temporizador monotónico propuesto en `Ampliacion_Rapidez_Media.md`: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/esp_timer.html
- Hoja de datos del ESP32, características eléctricas y límites de los pines: https://www.espressif.com/en/support/documents/technical-documents
- ArduinoJson 7: https://arduinojson.org/v7/
- ArduinoJson 7 con HTTPClient: https://arduinojson.org/v7/how-to/use-arduinojson-with-httpclient/
- Arduino, biblioteca `Wire` (I2C): https://docs.arduino.cc/language-reference/en/functions/communication/wire/

### Bibliotecas candidatas para la LCD 1602 I2C

Cuál se adopta está **[POR CONFIRMAR]**: debe coincidir con el `#include` del firmware.

- `LiquidCrystal I2C` (Frank de Brabander), disponible en el gestor de bibliotecas del
  Arduino IDE
- `LiquidCrystal_PCF8574` (Matthias Hertel): https://github.com/mathertel/LiquidCrystal_PCF8574
- `hd44780` (Bill Perry), con sketches de diagnóstico del bus I2C:
  https://github.com/duinoWitchery/hd44780

## Componentes del prototipo

Para estos componentes **no se citan hojas de datos concretas a propósito**: el modelo
real está **[POR CONFIRMAR]** o **[POR VERIFICAR]**, y citar la hoja de datos equivocada
introduciría afirmaciones falsas en el informe.

| Componente | Qué hay que identificar antes de citar una fuente |
|---|---|
| Módulo cargador **HW-373** | Serigrafía de la placa y marca del chip. Declarado como "tipo TP4056 o equivalente": hay que confirmarlo y buscar la hoja de datos **del chip que lleve el módulo que tienes** |
| Celda **18650** | Fabricante, referencia, capacidad, si es protegida. La hoja de datos del fabricante da las tensiones de carga y de corte reales |
| Panel solar de **6 V nominales** | Etiqueta del panel: tensión y corriente nominales y, si figura, tensión en circuito abierto |
| Módulos **infrarrojos** | Serigrafía del módulo y chip del comparador. De ahí sale el nivel activo documentado por el fabricante, que de todos modos hay que **medir** |
| Módulo **I2C de la LCD** | Expansor que lleva (PCF8574 o variante) y sus puentes de dirección |
| **ESP32 y placa de expansión** | Modelo exacto, para elegir la placa en el Arduino IDE y conocer sus pines |

Cuando identifiques cada uno, añade aquí la referencia concreta que hayas consultado.

## Bibliografía de electromagnetismo para el informe

El informe de la asignatura necesita respaldo teórico propio del curso. Los temas que el
prototipo permite desarrollar con datos medidos:

- **Divisor de tensión** y ley de Ohm: fundamentan la medición de voltaje del Sistema C y
  el cálculo de error de `Calculos_Experimentales.md`.
- **Campo magnético de un imán permanente** y su decaimiento con la distancia: base de la
  medición de distancia de activación del Sistema B.
- **Interruptores magnéticos y efecto Hall**: principio del elemento magnético del
  Sistema B, una vez identificado cuál quedó instalado.
- **Efecto fotovoltaico**: curva del panel, tensión en circuito abierto frente a tensión
  con carga.
- **Rapidez media** como magnitud escalar, distancia sobre tiempo: sección 5 de
  `Calculos_Experimentales.md`.

Usa el texto guía y la bibliografía indicada por el docente de la asignatura; esta
documentación no la sustituye.

## Diseño y arte

El estilo visual se adapta a la referencia aportada por el usuario el 27 de septiembre de
2026. La interfaz está implementada como componentes HTML/React y CSS: no es una imagen
de pantallas con botones inertes.

`frontend/public/maglev-station.png` es una **ilustración conceptual** generada con la
herramienta integrada de imágenes, en un solo intento. Muestra un tren plateado de
levitación y una estación fotovoltaica. **No es una fotografía del prototipo ni una vista
en directo**, y además corresponde al **diseño original con levitación**, no al prototipo
real, que circula sobre ruedas. Si la imagen se usa en el informe, hay que decir eso
expresamente.

Prompt utilizado: "Cinematic photorealistic 3D concept illustration of a silver futuristic
magnetic-levitation passenger train with luminous cyan running lights, approaching in the
left foreground, alongside an elegant modern station covered with photovoltaic solar
panels on the right and in the background. Midnight navy and azure shadows, soft early
dawn light, believable materials, wide landscape. No text, logos, watermark, interface,
cards, charts, borders or collage. Reference montage used only for style."

Los iconos se renderizan con Lucide. Las dependencias mantienen sus propias licencias en
sus paquetes. Las versiones exactas están en `frontend/package.json` y
`frontend/package-lock.json`.
