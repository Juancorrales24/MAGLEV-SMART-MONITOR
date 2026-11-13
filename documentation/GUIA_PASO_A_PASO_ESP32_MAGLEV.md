# GUÍA PASO A PASO — ESP32 conectado a MAGLEV Smart Monitor

**Versión preparada para el ZIP actualizado**. Esta guía explica qué hacer con el ESP32 físico, la web de Next.js, Supabase y GitHub. No hay credenciales reales en los archivos: deberás poner las tuyas en `config.h` y `.env.local`.

## Qué se modificó y qué se conservó

- **Sensores sin cambios de conexión**: estación 1 en GPIO 25, estación 2 en 26 y estación 3 en 27; `LOW` significa obstáculo y se conserva `INPUT_PULLUP` del código inicialmente compartido. La LCD y la web *local* muestran la primera estación activa según la prioridad **1 → 2 → 3**.
- **LCD**: mantiene el nombre de estación durante **5 segundos desde la salida confirmada** del último sensor visible. Un nuevo paso reemplaza el nombre inmediatamente. No se usa `delay(5000)`.
- **Web local del ESP32**: funciona sin Internet mediante la red `MAGLEV-MONITOR` → `http://192.168.4.1`.
- **Web principal MAGLEV**: continúa usando `/api/ingest` → Supabase → Next.js. Su etiqueta de 5 segundos parte de la **salida recibida por el servidor**; puede aparecer después del LCD si hay retraso de Internet.
- **Medidas**: GPIO 34 (panel) y GPIO 35 (batería), dos divisores independientes de 100 kΩ/47 kΩ; pantalla SDA GPIO 21 y SCL GPIO 22; sin sensor de corriente ni medición de potencia.
- **Iluminación magnética**: los LED y sensores magnéticos de cada estación son un circuito **independiente del ESP32**, no se mezclan con los sensores infrarrojos.

> **Limitación real**: el firmware del ZIP usa un antirrebote configurable de 20 ms (`IR_ANTIRREBOTE_MS`). Si un paso rápido produce un pulso menor que ese tiempo, la detección puede perderse. No se cambió automáticamente este parámetro. Solo ajustarlo después de verificarlo con el tren y el monitor serie. HTTPS puede retener `loop()` durante una petición; el firmware conserva el último flanco por interrupción, pero no puede garantizar capturar todos los pulsos ultracortos que ocurran enteramente durante un bloqueo.

## ETAPA 1 — Prueba física local, sin instalar Supabase

### Paso 1. Verifica el circuito con un multímetro antes de conectarlo

| Componente | Conexión lógica de ESP32 | Atención |
|---|---|---|
| Sensor infrarrojo estación 1 | Salida digital → GPIO25 | Comprobar 0–3.3 V en salida |
| Sensor infrarrojo estación 2 | Salida digital → GPIO26 | Comprobar 0–3.3 V en salida |
| Sensor infrarrojo estación 3 | Salida digital → GPIO27 | Comprobar 0–3.3 V en salida |
| Panel solar | Divisor 100k/47k → GPIO34 | Nunca conectar panel directamente al GPIO |
| Batería 18650 | Otro divisor 100k/47k → GPIO35 | Nunca conectar la batería directamente al GPIO ni a 3V3 sin regulación |
| Pantalla I²C | SDA → GPIO21, SCL → GPIO22 | Confirmar 0x27/0x3F y que SDA/SCL no tengan pull-up de 5 V |

Divisor de cada lectura: **positivo medido → resistencia 100 kΩ → (nodo conectado al ADC) → resistencia 47 kΩ → GND**. Todos los GND de la medición deben compartir referencia. El valor en el ADC es aproximadamente el 32 % del voltaje de entrada. **Confirma el voltaje máximo real del panel en circuito abierto**: un panel nominal de 6 V puede superar su tensión nominal. Debe quedar margen respecto del máximo permitido en GPIO. **La alimentación del ESP32 debe provenir de una salida regulada adecuada**; no conectes la batería 18650 ni el panel directamente al pin 3V3. Verifica la compatibilidad de la entrada del módulo cargador con la salida real del panel, así como polaridad, protección y tensión.

**Importante**: si la pantalla I²C o los sensores trabajan a 5 V, verifica sus niveles lógicos. Los GPIO del ESP32 **no son tolerantes a 5 V**; usa adaptación de niveles donde corresponda. El GND de cada módulo digital debe coincidir con el del ESP32, sin alterar el circuito magnético independiente.

### Paso 2. Abre el firmware correcto

En la carpeta actualizada:

```text
esp32/
  MaglevSender/
    MaglevSender.ino
    config.h.example
```

Copia `config.h.example` al lado de `MaglevSender.ino` y llama a la copia **`config.h`** (no `config.h.txt`). Ese archivo no debe subirse a GitHub. Para la primera prueba, deja `WIFI_SSID`, `DEVICE_ID` y `DEVICE_TOKEN` vacíos: el monitor local funciona sin la nube.

La red local ya está configurada con:

```cpp
const char* AP_SSID = "MAGLEV-MONITOR";
const char* AP_PASSWORD = "Maglev2026";
```

Cambia la contraseña antes de exponer la maqueta públicamente; debe tener al menos 8 caracteres.

### Paso 3. Instala Arduino IDE y las bibliotecas

1. En Arduino IDE → Archivo → Preferencias → URLs adicionales de Gestor de placas, agrega `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
2. En Gestor de placas instala **esp32 (Espressif Systems)**. Selecciona el modelo exacto de tu placa; si es una ESP32 genérica, prueba *ESP32 Dev Module*.
3. En el gestor de bibliotecas instala **ArduinoJson versión 7** y la variante **LiquidCrystal I2C** compatible con `#include <LiquidCrystal_I2C.h>` y con los métodos `init()` y `backlight()`.
4. Abre **MaglevSender.ino** desde su carpeta, comprueba que `config.h` esté al lado, conecta el USB de datos y selecciona el puerto.
5. Compila con ✓ y después carga con →. Si sale error de biblioteca, verifica la versión. Si no aparece el puerto, cambia cable o instala el driver USB de la placa.
6. Abre el **Monitor serie a 115200 baudios**.

> Todavía no hay confirmación de compilación en hardware físico. No declares la etapa completada hasta ver el sketch cargado y los eventos en el monitor serie.

### Paso 4. Prueba la LCD y el dashboard local

1. En el monitor serie debe aparecer `RED MAGLEV LOCAL: MAGLEV-MONITOR` y la IP del ESP32.
2. Desde el celular conéctate a la WiFi **MAGLEV-MONITOR** con la contraseña de `config.h`.
3. Si el celular dice «sin Internet», elige **mantener conexión**: es normal, estás accediendo directamente al ESP32.
4. Abre **http://192.168.4.1**. Deben aparecer el panel solar, batería, tres estaciones y el estado de red. Hasta la primera lectura ADC puede mostrar `--`.
5. Activa el sensor 1 con un objeto. La LCD debe mostrar `ESTACION 1`. Retíralo; el texto debe quedar **5 segundos**. Si antes de que expire activas el sensor 2, debe mostrarse `ESTACION 2` inmediatamente después de que se confirme su detección.
6. Repite con las tres estaciones y revisa las líneas `IR: estacion ...` del monitor serie.
7. Abre **http://192.168.4.1/datos** para ver el JSON real que envía el monitor local.

Si no aparece el nombre al pasar el tren, comprueba si el ESP32 registra `TREN DETECTADO` y `TREN SALIO`. Si ni siquiera lo registra, el problema puede ser la duración del pulso menor que 20 ms, la distancia, el umbral del sensor, su polaridad o su nivel lógico; **retener la pantalla no corrige una detección que nunca sucedió**.

## ETAPA 2 — Preparar el MAGLEV de GitHub

### Paso 5. Configura Supabase, si todavía no lo has hecho

Necesitas un proyecto de Supabase y una cuenta con rol administrador. En **SQL Editor** ejecuta, **en este orden**, para una instalación nueva:

1. `supabase/database.sql`
2. `supabase/policies.sql`
3. `supabase/functions.sql`
4. `supabase/realtime.sql`

Si tenías una base anterior y no estás instalando de cero, consulta `supabase/migrations/20261107_deteccion_estaciones.sql` y `supabase/README.md` antes de ejecutar cambios. No apliques dos veces a ciegas scripts antiguos. Crea el usuario en **Authentication → Users** y después edita el correo de `supabase/bootstrap_admin.sql` para habilitar el administrador. **No publiques claves de Supabase**.

### Paso 6. Inicia la web en tu computador

Instala **Node.js 22 o posterior**. En una terminal, dentro de `frontend/`, crea `.env.local` a partir de `.env.example` y completa:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_PRIVADA_SOLO_DEL_SERVIDOR
NEXT_PUBLIC_STALE_SECONDS=60
```

La clave `service_role` es **secreta**: no debe llevar el prefijo `NEXT_PUBLIC_`, no va en el ESP32 y no se sube a GitHub. Ejecuta:

```bash
cd frontend
npm ci
npm run check
npm run dev
```

Abre `http://localhost:3000`, inicia sesión y verifica las pantallas `/dashboard`, `/train`, `/solar`, `/settings`. El comando `npm run check` ejecuta las comprobaciones del proyecto; si da error, compárteme el texto antes de continuar.

### Paso 7. Publica la web para que el ESP32 llegue por Internet

**GitHub es el repositorio del código; GitHub por sí solo no ejecuta la API de Next.js ni Supabase.** Necesitas alojar Next.js en un servidor compatible, por ejemplo Vercel:

1. Importa el repositorio desde GitHub a Vercel.
2. En **Root Directory** selecciona **`frontend`**.
3. Configura las mismas 4 variables del `.env.local` en Vercel, incluida `SUPABASE_SERVICE_ROLE_KEY` como secreto de servidor.
4. Despliega y abre la URL **HTTPS** real del proyecto (por ejemplo `https://tu-maglev.vercel.app`).
5. Inicia sesión con el usuario ya habilitado. Si no funciona el login, primero arregla la conexión de Supabase.

**No pongas `http://localhost:3000/api/ingest` en el ESP32** si tu objetivo es enviar a la plataforma publicada: `localhost` allí significa la propia placa, no tu computador.

## ETAPA 3 — Vincular la placa con tu MAGLEV publicado

### Paso 8. Registra el dispositivo desde la web

Entra como administrador a la web desplegada → **Configuración → Dispositivos registrados → Registrar**:

- Nombre: `ESP32 MAGLEV` (o el nombre que prefieras).
- Módulo: **Tren y estación solar** (`combined`).
- Pulsa **Registrar y generar clave**.
- Copia **DEVICE_ID** (UUID) y **DEVICE_TOKEN** (se muestra una sola vez).

### Paso 9. Completa `config.h` y vuelve a cargar el ESP32

En `esp32/MaglevSender/config.h` escribe:

```cpp
const char* WIFI_SSID = "NOMBRE_DE_TU_WIFI_2_4_GHZ";
const char* WIFI_PASSWORD = "TU_CONTRASENA";
const char* API_URL = "https://TU_DOMINIO_REAL/api/ingest";
const char* DEVICE_ID = "UUID_QUE_TE_ENTREGO_MAGLEV";
const char* DEVICE_TOKEN = "TOKEN_QUE_TE_ENTREGO_MAGLEV";
const char* ROOT_CA = R"PEM(
-----BEGIN CERTIFICATE-----
PEGA_AQUI_EL_CERTIFICADO_RAIZ_EN_BASE64
-----END CERTIFICATE-----
)PEM";
```

**El ejemplo anterior es ilustrativo**: no sirve como certificado real. Obtén el certificado de la **CA raíz** correspondiente a la cadena TLS del dominio HTTPS desplegado (inspector de certificado del navegador → cadena de certificados → raíz → exportar PEM/Base64). Debe poder verificarse por el ESP32, y su hora NTP debe estar sincronizada. **No uses `setInsecure()` para saltarte TLS**: expondrías el token del dispositivo. El certificado raíz puede cambiar si el proveedor rota la cadena; deberás actualizarlo cuando sea necesario.

Usa WiFi de **2.4 GHz**, con salida real a Internet. Compila y carga de nuevo el firmware.

### Paso 10. Comprueba el envío en vivo

1. En monitor serie a **115200** confirma que el router conectó y que la hora NTP es válida.
2. Deja que el ESP32 tome una lectura solar. Si todo está bien aparecerá `OK 201` o `OK 200` después del POST HTTPS.
3. Abre la web publicada → `/monitoring` o `/dashboard`: **última recepción** reciente.
4. Pasa el tren por la estación 1: en `/train` deben aparecer llegada y salida. Repite con estaciones 2 y 3.
5. En `/solar` deben aparecer voltajes y porcentaje **estimado** de batería. Corriente y potencia continuarán vacíos, porque no hay sensor de corriente.
6. Si una detección dura menos de lo requerido por el firmware, el evento no aparecerá en la nube ni en LCD; ajusta el sensor y el tiempo de antirrebote solo después de una prueba real.

El sensor físico se refleja **primero en LCD/local**, y **después** llega al servidor. La red, la cola (hasta 16 mensajes) y el límite de 1 mensaje nuevo/s pueden producir demora en el historial de la web. La cuenta regresiva de 5 s en `/train` se calcula desde la recepción de la salida, no desde la salida física. **No son relojes perfectamente sincronizados**.

## ETAPA 4 — Actualizar el GitHub

En tu copia local del repositorio, sustituye los archivos por los del ZIP actualizado. Antes de confirmar:

```bash
git status
git check-ignore -v esp32/MaglevSender/config.h
git add esp32 frontend documentation README.md
git commit -m "Integra monitor local ESP32 y retencion de estaciones 5s"
git push
```

Si `git check-ignore` no indica que `config.h` está ignorado, **no hagas push todavía**: protege el archivo primero. `frontend/.env.local` también debe seguir ignorado. Vercel puede volver a desplegar automáticamente al recibir el push, si ya conectaste el repositorio.

## Diagnóstico breve

| Síntoma | Qué revisar primero |
|---|---|
| No abre `192.168.4.1` | Conectarte a `MAGLEV-MONITOR` y mantener WiFi sin Internet; monitor serie para IP |
| LCD no muestra letras | Alimentación, contraste, 0x27/0x3F, SDA 21, SCL 22 y niveles I²C seguros |
| El tren pasa pero no aparece nada | GPIO, salida LOW real, 3.3 V máximo, sensor bien orientado, pulso vs antirrebote de 20 ms |
| La LCD responde y la nube no | Configuración de WiFi, API_URL, DEVICE_ID/TOKEN, CA, NTP, Internet o servicio remoto |
| HTTP 401 | DEVICE_ID o DEVICE_TOKEN incorrectos / clave rotada |
| HTTP 403 | Dispositivo desactivado en Configuración |
| HTTP 429 | Límite de un mensaje cada 400 ms: el firmware conserva el mensaje y reintenta a los 600 ms |
| HTTP 404 | API_URL no termina correctamente en `/api/ingest` o el despliegue no contiene esa ruta |
| No hay corriente ni potencia | No existe sensor para esas magnitudes: no se deben inventar datos |

**Estado de validación de esta entrega:** la lógica de retención de la web se verificó con pruebas automatizadas de estados de estación; el firmware está pendiente de compilación en tu versión de Arduino IDE y de prueba eléctrica y de comunicación con la placa física. No se ha modificado tu cuenta de GitHub ni Supabase automáticamente: el ZIP es una copia lista para integrar.
