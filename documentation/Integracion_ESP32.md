# Integración del ESP32: registro, configuración y carga del firmware

Guía para seguir **con el ESP32 en las manos**. Antes de llegar aquí conviene haber
hecho las comprobaciones de `Verificacion_Electrica.md`,
`Verificacion_Sensores_IR.md` y `Verificacion_LCD_I2C.md`.

## Qué está implementado y qué no

**[IMPLEMENTADO]** en `esp32/MaglevSender/MaglevSender.ino`:

| Función | Detalle |
|---|---|
| Transporte HTTPS a `/api/ingest` | Con verificación TLS mediante certificado raíz; **no** usa `setInsecure()` |
| Reconexión WiFi | Reintento cada 10 s si se pierde la conexión |
| Reintentos con espera creciente | 2 s que se duplican hasta un máximo de 60 s |
| `sample_id` UUID v4 | Generado con el hardware de aleatoriedad del chip, **conservado entre reintentos** |
| Espera de hora NTP | No envía hasta tener una hora válida, necesaria para comprobar la vigencia del certificado |
| Limpieza de `null` | Elimina campos nulos y bloques vacíos antes de enviar, porque la API los rechazaría junto con las lecturas válidas del mismo mensaje |
| Entrada por puerto serie | Acepta una línea JSON por lectura, hasta 2048 bytes |
| **Medida del panel y de la batería por ADC** | Divisor resistivo en `PIN_PANEL` y `PIN_BATERIA`, promedio de 20 muestras, cada 5 s |
| Estimación del porcentaje de batería | Curva aproximada de celda de litio entre 3.00 V y 4.20 V |

**Pendiente o ausente en el sketch, a la fecha de este documento:**

- **No hay código de lectura de los sensores infrarrojos.** El bloque `train_status` se
  puede alimentar hoy por el **puerto serie**, con el formato de abajo.
- **No hay código de la LCD 1602.**
- El sketch mide el voltaje de la batería pero **no envía `battery_voltage`**: solo
  `panel_voltage` y `battery_level`. La columna quedará en `null` hasta que el firmware
  lo incluya.
- `CAL_PANEL` y `CAL_BATERIA` valen `1.0`: **el sistema no está calibrado**.

El firmware se está ampliando en esta misma rama. **Abre el archivo y comprueba qué
pines y qué bloques produce** antes de dar por cierto cualquiera de estos puntos.

> **Nada de esto se ha probado con hardware.** No hay ESP32, sensores ni compilador de
> Arduino en el entorno donde se redactó esta documentación: el sketch **no se ha
> compilado ni cargado**. Todo lo relativo a la placa está
> **[PENDIENTE DE PRUEBA FÍSICA]**.

---

## 1. Registrar el ESP32 en la plataforma y obtener `DEVICE_ID` y `DEVICE_TOKEN`

Necesitas la web funcionando y una cuenta de **administrador activo** (ver
`Instalacion.md`).

1. Inicia sesión y entra en **Configuración**.
2. En el panel **Dispositivos registrados**, pulsa **Registrar**.
3. Completa el formulario:
   - **Nombre**: entre 2 y 100 caracteres. Por ejemplo, el nombre del prototipo.
   - **Módulo**: para este prototipo, **Tren y estación solar** (`combined`), porque el
     mismo ESP32 atiende los sensores del tren y la estación solar. La etiqueta es
     administrativa: no restringe qué bloques puede enviar.
   - **Ubicación**: texto libre, hasta 200 caracteres. Opcional.
4. Pulsa **Registrar y generar clave**.
5. Se abre el diálogo **Clave de envío del dispositivo** con dos datos:
   - **Identificador** → es tu `DEVICE_ID` (un UUID).
   - **Clave** → es tu `DEVICE_TOKEN`.
6. **Cópialos antes de cerrar el diálogo.** El botón *Copiar credenciales* los deja en el
   portapapeles con el formato `DEVICE_ID=…` y `DEVICE_TOKEN=…`.

> **La clave se muestra una sola vez.** El servidor guarda únicamente su **hash
> SHA-256**: no existe ninguna pantalla ni consulta que permita volver a leerla. Si la
> pierdes, no se recupera: hay que generar una nueva.

### Si pierdes la clave, o quieres rotarla

En **Configuración → el dispositivo → Cambiar clave**:

- Se genera una clave nueva y se muestra una sola vez.
- **La clave anterior deja de funcionar de inmediato.** El ESP32 empezará a recibir
  **401** hasta que actualices `config.h` y vuelvas a cargar el firmware.
- Rotar la clave de un dispositivo **no afecta** a los demás.
- Los registros ya guardados **se conservan**.

### Desactivar un dispositivo

El botón **Desactivar** detiene la recepción: la API responde **403** a sus mensajes y
los registros existentes se conservan. Útil para descartar que un dato raro venga de una
placa concreta. Recuerda volver a **Activar** antes de la demostración.

---

## 2. Configurar `config.h`

El sketch no se compila sin `config.h`, y ese archivo **no está en el repositorio a
propósito**: contiene credenciales.

1. Entra en `esp32/MaglevSender/`.
2. Copia `config.h.example` como **`config.h`**, en la **misma carpeta** que el `.ino`.
3. Completa los campos. La estructura del archivo de ejemplo es:

```cpp
#pragma once
// Copiar este archivo como config.h y completar localmente. No compartir config.h.
const char* WIFI_SSID = "";
const char* WIFI_PASSWORD = "";
const char* API_URL = "https://TU_DOMINIO/api/ingest";
const char* DEVICE_ID = "";   // Configuración > Registrar dispositivo
const char* DEVICE_TOKEN = "";
// Certificado CA raíz PEM del dominio HTTPS de API_URL. No usar setInsecure().
const char* ROOT_CA = R"PEM(
)PEM";
```

| Campo | Qué poner | Comprobación que hace el firmware |
|---|---|---|
| `WIFI_SSID` | Nombre exacto de la red, respetando mayúsculas | No puede quedar vacío |
| `WIFI_PASSWORD` | Contraseña de la red | Puede quedar vacío solo en una red abierta |
| `API_URL` | URL completa de tu despliegue, **terminada en `/api/ingest`** | Debe empezar por `https://` |
| `DEVICE_ID` | El UUID del paso 1 | No puede quedar vacío |
| `DEVICE_TOKEN` | La clave del paso 1 | No puede quedar vacío |
| `ROOT_CA` | Certificado **raíz** en formato PEM del dominio de `API_URL` | Debe tener más de 100 caracteres |

Si falta alguno, el programa **no arranca**: imprime
`Completa config.h: WiFi, HTTPS, dispositivo, clave y certificado CA.` y se detiene. Es
un comportamiento intencional, no un error.

### El certificado raíz

`ROOT_CA` debe contener el certificado de la **autoridad raíz** de la cadena de tu
dominio, en PEM, entre los delimitadores `R"PEM( ... )PEM"`, incluyendo las líneas
`-----BEGIN CERTIFICATE-----` y `-----END CERTIFICATE-----`.

Cómo obtenerlo: en el navegador, abre tu dominio, entra en la información del
certificado, recorre la cadena hasta la raíz y exporta esa raíz en formato PEM / Base-64.

Qué tener en cuenta:

- Un certificado raíz **caduca**, y el proveedor de alojamiento puede **cambiar de
  cadena**. Si el ESP32 deja de conectar de un día para otro sin tocar nada, revisa
  esto antes que el cableado.
- El ESP32 necesita **hora válida** para comprobar la vigencia: el sketch no envía nada
  hasta que NTP responde. Sin salida a Internet hacia los servidores de hora, se queda
  esperando en silencio.
- **No sustituyas la verificación por `setInsecure()`.** Eso permitiría a cualquiera en
  la red interceptar la clave del dispositivo. Ver `Seguridad.md`.

### Qué NO va en `config.h`

- **Nunca** la clave de servicio de Supabase (`SUPABASE_SERVICE_ROLE_KEY`). El ESP32 no
  la necesita: habla con tu API, no con Supabase.
- **Nunca** la contraseña de tu cuenta de la plataforma.

`config.h` queda fuera del control de versiones. Compruébalo antes de hacer `commit`:

```bash
git status
git check-ignore -v esp32/MaglevSender/config.h
```

Si `git status` lo lista como archivo nuevo, **no lo subas**: avisa para que se añada al
`.gitignore`.

---

## 3. Cargar el firmware con Arduino IDE

### 3.1 Soporte de placa ESP32

1. Abre Arduino IDE → **Archivo → Preferencias**.
2. En **URLs adicionales de gestor de placas**, añade la URL oficial del paquete de
   Espressif para Arduino:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Herramientas → Placa → Gestor de placas**, busca **esp32** (de Espressif Systems) e
   instálalo. La descarga es grande: ten paciencia y conexión estable.
4. Anota la **versión** del core que instalaste. Es un dato que conviene registrar en el
   informe, porque el comportamiento de `analogReadMilliVolts()` y de los parámetros del
   ADC depende de ella.

### 3.2 Bibliotecas necesarias

**Herramientas → Gestionar bibliotecas**:

| Biblioteca | Para qué | Estado |
|---|---|---|
| **ArduinoJson 7** (Benoit Blanchon) | Construir y leer los mensajes JSON. El sketch usa la API de la versión 7 (`JsonDocument` sin tamaño fijo): **la versión 6 no sirve** | **Necesaria ya** |
| Biblioteca de **LCD 1602 I2C** | Escribir en la pantalla | **Necesaria cuando el firmware incluya la LCD.** Opciones habituales: `LiquidCrystal I2C` (Frank de Brabander), `LiquidCrystal_PCF8574` (Matthias Hertel), `hd44780` (Bill Perry). **[POR CONFIRMAR]**: debe coincidir con el `#include` del sketch |

`WiFi`, `WiFiClientSecure`, `HTTPClient` y `esp_system` vienen con el core de ESP32: no
se instalan por separado.

### 3.3 Abrir el proyecto

Abre **`esp32/MaglevSender/MaglevSender.ino`** desde su propia carpeta. Arduino IDE exige
que el `.ino` esté en una carpeta del mismo nombre; `config.h` debe estar al lado y
aparecerá como una pestaña más.

### 3.4 Seleccionar placa y puerto

1. **Herramientas → Placa → esp32 →** la que corresponda a tu módulo. Para las placas de
   desarrollo más comunes, *ESP32 Dev Module* es el punto de partida; con una placa de
   expansión, **[POR CONFIRMAR]** el modelo exacto, que puede ser otro.
2. **Herramientas → Puerto →** el puerto serie que **aparece al conectar** la placa:
   - Windows: `COM3`, `COM4`, …
   - Linux: `/dev/ttyUSB0` o `/dev/ttyACM0`
   - macOS: `/dev/cu.usbserial-…` o `/dev/cu.wchusbserial-…`
3. Si **no aparece ningún puerto**:
   - Prueba otro cable USB: muchos cables son solo de carga y no llevan datos.
   - Instala el controlador del conversor USB-serie de la placa (CP210x, CH340 o FTDI
     según el chip que lleve; **[POR CONFIRMAR]** cuál es el tuyo).
   - En Linux, añade tu usuario al grupo del puerto serie y vuelve a iniciar sesión.
4. Deja la velocidad de subida en su valor por defecto. Si la carga falla a mitad,
   bájala.

### 3.5 Compilar y cargar

1. **Verificar** (✓) primero: compila sin tocar la placa y detecta errores de
   configuración o bibliotecas.
2. **Subir** (→) después.
3. Si la carga se queda en `Connecting....____`, mantén pulsado el botón **BOOT** de la
   placa mientras empieza la subida y suéltalo cuando avance.
4. Si falla pidiendo un pin libre, recuerda que **GPIO0, 2, 12 y 15** son pines de
   arranque: un sensor conectado ahí puede impedir la carga. Desconéctalo y repite.

### 3.6 Monitor serial a 115200 baudios

**Herramientas → Monitor Serie**, y selecciona **115200 baudios**. Es la velocidad que
fija `Serial.begin(115200)` en el sketch: con otra velocidad verás caracteres sin
sentido.

Mensajes que produce el firmware y qué significan:

| Mensaje | Significado |
|---|---|
| `Completa config.h: …` | Falta un campo de `config.h`. El programa se detiene ahí. |
| `Midiendo panel solar y bateria localmente; tambien acepta lecturas JSON por Serial.` | Arranque correcto. |
| `OK: lectura recibida.` | La API respondió 200 o 201. |
| `REINTENTO HTTP <código>` | Error de red, 429 o 5xx: conserva la muestra y reintenta con espera creciente. |
| `ERROR HTTP <código>: revisar credenciales o formato. Lectura descartada.` | 4xx definitivo (401, 403, 400, 413, 415): la muestra **se descarta**. Revisa credenciales y formato. |
| `ERROR: JSON invalido del sensor.` | La línea recibida por serie no es JSON válido. |
| `ERROR: falta un bloque de mediciones reales.` | La línea no trae ningún bloque con datos. |
| `ERROR: linea mayor de 2048 bytes.` | Línea demasiado larga; se descarta hasta el siguiente salto de línea. |

Si no aparece nada: velocidad equivocada, puerto equivocado, o la placa está en modo de
carga. Pulsa **EN/RST** para reiniciarla.

---

## 4. Alimentar el bloque `train_status` por el puerto serie

Mientras el sketch no lea los sensores infrarrojos directamente, el camino existente es
enviarle **una línea JSON por evento** al puerto serie:

```
{"train_status":{"station_number":2,"detected":true}}
```

Reglas de ese canal, tal como está implementado:

- **Una lectura por línea**, terminada en salto de línea.
- Máximo **2048 bytes** por línea.
- El sketch **añade `sample_id`**: no lo pongas tú.
- Si incluyes `sampled_at`, debe ser ISO 8601 **con zona**. Si no conoces el instante de
  adquisición, **omítelo**: el firmware no lo inventa.
- Mantiene **un solo mensaje pendiente** en RAM: no envíes el siguiente evento hasta ver
  `OK: lectura recibida.`
- **No mezcles mensajes de depuración con las líneas JSON** en el mismo puerto.

Si integras la lectura de los sensores en el mismo ESP32, construye el objeto y pásalo a
`acceptSensorLine()` con el JSON ya serializado en un `String`. **No** lo imprimas por
`Serial` esperando que el propio programa se lo lea a sí mismo.

```cpp
// Fragmento de ejemplo: pertenece al productor de eventos, no al transporte.
// estacion y hayTren deben venir de la lectura real del sensor.
JsonDocument evento;
evento["train_status"]["station_number"] = estacion;   // 1, 2 o 3
evento["train_status"]["detected"] = hayTren;          // true o false
String linea; serializeJson(evento, linea);
acceptSensorLine(linea);
```

Recuerda el límite de **un mensaje nuevo por segundo y por dispositivo**: con un solo
ESP32 compartido por los tres sensores y la estación solar, dos eventos muy seguidos
provocan **429** y reintento. El dato no se pierde, pero llega más tarde. Ver
`Modelo_Datos.md`.

---

## 5. Comprobación de extremo a extremo

Orden recomendado, con el firmware ya cargado:

1. **Monitor serial**: confirma el mensaje de arranque y que no se queda en
   `Completa config.h`.
2. **WiFi y hora**: si no envía nada y tampoco reporta error, puede estar esperando NTP.
3. **Primer mensaje**: espera `OK: lectura recibida.`
4. **Base de datos**: comprueba que aparece una fila nueva en `solar_station` o
   `train_status`.
5. **Plataforma**: en **Configuración**, el dispositivo debe mostrar una **Última
   recepción** reciente.
6. **Vistas**: el dato debe aparecer en el dispositivo **correcto** (la barra superior
   selecciona el dispositivo).
7. **Prueba de desconexión**: apaga el emisor y espera más de 60 segundos. La web debe
   **dejar de indicar LIVE**. Un panel que sigue diciendo que todo está en vivo con el
   emisor apagado es un fallo.

Todas estas comprobaciones están **[PENDIENTE DE PRUEBA FÍSICA]**.

## 6. Límites honestos del emisor

- Mantiene **un solo mensaje pendiente en RAM**. **No** hay cola en flash: un corte de
  alimentación pierde la muestra pendiente. **No se afirma que cada muestra quede
  almacenada ante una interrupción eléctrica.**
- No lleva reloj con respaldo: tras cada arranque depende de NTP.
- Ante **4xx distinto de 429** descarta la muestra, por diseño: un mensaje mal formado o
  con credenciales erróneas no mejora reintentando.
- `sampled_at` solo viaja si el productor lo proporciona. Si no, la única fecha es la de
  **recepción** (`created_at`), que incluye la latencia de la red.
- El tiempo de espera del saludo TLS está limitado a 10 segundos y el de HTTP a 8
  segundos, para que una red inestable no bloquee el bucle principal.
