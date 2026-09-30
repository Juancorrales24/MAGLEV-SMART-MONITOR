# Integración de ESP32 y sensores reales

## Qué está implementado

La web y la API están preparadas para recibir datos reales. `esp32/MaglevSender/MaglevSender.ino` implementa transporte HTTPS, reconexión WiFi, reintentos y un UUID que evita duplicados. Recibe una línea JSON del productor de mediciones por Serial; no lee pines que no se han especificado ni genera números de demostración.

Aún necesitas identificar los modelos de sensor, sus pines, unidades, calibración y el algoritmo de estabilidad. Esos datos no se proporcionaron con el proyecto. Por ello el programa de envío es un adaptador funcional del transporte; no se presenta como un controlador terminado del hardware desconocido.

## Configurar el emisor

1. Instala el soporte Arduino ESP32 y ArduinoJson 7 en Arduino IDE. Abre `esp32/MaglevSender/MaglevSender.ino` dentro de su carpeta.
2. Copia `config.h.example` como `config.h` al lado del archivo `.ino`.
3. Completa WiFi, URL HTTPS terminada en `/api/ingest`, identificador y clave obtenidos en Configuración de la web.
4. Introduce en `ROOT_CA` el certificado raíz PEM correspondiente al dominio de tu servidor. Obténlo de la cadena certificada del alojamiento. El firmware verifica TLS; no usa `setInsecure()`.
5. Carga el programa en la placa correspondiente y abre Serial a 115200 baudios. La placa espera hora NTP válida para la comprobación TLS.
6. Conecta tu productor de lecturas al flujo serial, o integra las llamadas del controlador para producir los mismos bloques JSON. No mezcles mensajes de depuración con líneas JSON de sensores.

## Mensaje enviado a la API

Cabeceras:

```http
POST /api/ingest
Content-Type: application/json
Authorization: Bearer CLAVE_INDIVIDUAL_DEL_DISPOSITIVO
X-Device-Id: UUID_DEL_DISPOSITIVO
```

El contenido debe contener `sample_id` UUID y uno o varios bloques: `measurements`, `train_status`, `solar_station`. Opcionalmente incluye `sampled_at` en ISO 8601 con zona. Todos los valores medidos deben ser números JSON; omite lo que no se midió. Consulta nombres y unidades en `Modelo_Datos.md`.

Ejemplo de construcción desde variables de un sensor, sin constantes de medición:

```cpp
JsonDocument packet;
// voltageFromSensor y currentFromSensor deben venir de tu adquisición real.
packet["measurements"]["voltage"] = voltageFromSensor;
packet["measurements"]["current"] = currentFromSensor;
// Añade energía, altura o batería solamente cuando sus lecturas sean válidas.
serializeJson(packet, Serial);
Serial.println();
```

Este fragmento pertenece al productor de lecturas. Si lo integras en el mismo ESP32, pásalo directamente a `acceptSensorLine()` después de serializarlo en un String; no lo reenvíes al mismo puerto esperando que se lea a sí mismo. En una implementación con dos equipos, conecta UART correctamente y separa las salidas de depuración de los mensajes de sensor.

El programa suministrado agrega `sample_id`; si implementas otro emisor, genera un UUID v4 una sola vez por adquisición. Guarda el mismo cuerpo durante los reintentos.

## Respuestas

| Código | Significado |
|---|---|
| 201 | Lectura nueva guardada: `ok: true, duplicate: false` |
| 200 | Ese sample_id ya fue aceptado: `ok: true, duplicate: true` |
| 400 | JSON, campos, rangos o fecha inválidos |
| 401 | Identificador o clave no válidos |
| 403 | Dispositivo desactivado |
| 413 | Mensaje mayor a 16 KiB |
| 415 | Content-Type incorrecto |
| 429 | Más de un mensaje nuevo por segundo |
| 500/503 | Error o configuración incompleta del servidor |

El emisor espera al menos dos segundos entre envíos y usa espera creciente hasta 60 segundos en errores de red, 429 o 5xx. En otros errores 4xx informa el código y descarta la muestra inválida. La línea de entrada está limitada a 2.048 bytes.

## Límites y puesta en marcha

El emisor mantiene un solo mensaje pendiente en RAM. No garantiza almacenamiento durante apagones ni conserva una cola en flash. El productor debe esperar confirmación antes de emitir otra adquisición, o implementar una cola según sus necesidades. No se afirma que cada muestra quede almacenada ante una interrupción de alimentación.

Verifica primero la polaridad, unidades y calibración de cada sensor. Después confirma que aparece una nueva fila en Supabase, que cambia `last_seen` y que la web muestra la lectura del dispositivo correcto. Desconecta el emisor y espera más de 60 segundos: debe dejar de indicar LIVE. Estas comprobaciones físicas quedan pendientes hasta disponer del equipo real y su configuración.
