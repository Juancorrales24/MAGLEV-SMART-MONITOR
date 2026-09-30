# Modelo de datos y unidades

## Tablas

| Tabla | Contenido | Escritura |
|---|---|---|
| `profiles` | id de Auth, nombre, correo, rol, activo, creación | Trigger y API administrativa |
| `devices` | Nombre, tipo, ubicación, habilitado, última recepción | API administrativa / ingestión |
| `device_credentials` | Hash SHA-256 de clave por dispositivo | Solo API administrativa |
| `ingest_receipts` | Identidad de mensajes aceptados | Solo ingestión; evita duplicados |
| `measurements` | Variables eléctricas del sistema | Solo ingestión |
| `train_status` | Variables del tren | Solo ingestión |
| `solar_station` | Variables fotovoltaicas | Solo ingestión |

Cada tabla de lecturas tiene `id` UUID, `device_id` UUID, `sample_id` UUID, `sampled_at` opcional y `created_at` generado por el servidor. Un mensaje puede crear una fila en cada una de las tres tablas, con la misma fecha de recepción e identificador de muestra.

`created_at` y `last_seen` determinan el estado de conexión. No se usa el reloj del ESP32 para afirmar que una recepción es reciente. `sampled_at` describe el momento de adquisición cuando el emisor lo conoce; el CSV conserva ambas fechas en UTC. El navegador muestra horas en la zona local.

## Contrato de mediciones

| Bloque | Campo | Unidad | Validación de recepción |
|---|---|---|---|
| measurements | voltage | V | 0 a 10.000 |
| measurements | current | A | −10.000 a 10.000 |
| measurements | power | W | −100.000.000 a 100.000.000 |
| measurements | energy | Wh | 0 a 10¹² |
| train_status | levitation_height | mm | 0 a 1.000 |
| train_status | stability | % | 0 a 100 |
| train_status | temperature | °C | −100 a 500 |
| solar_station | panel_voltage | V | 0 a 10.000 |
| solar_station | panel_current | A | −10.000 a 10.000 |
| solar_station | power_output | W | −100.000.000 a 100.000.000 |
| solar_station | battery_level | % | 0 a 100 |

Estos rangos son límites del formato, no umbrales seguros de operación. Deben adecuarse al hardware si se requiere un contrato más estricto. La corriente/potencia admiten signo para respetar la convención definida por el controlador.

La energía es el acumulado enviado por el medidor; la web no suma acumulados ni reconstruye energía a partir de filas incompletas. Un reinicio del contador puede disminuir la curva y no se oculta. La batería requiere una estimación válida del circuito de medición; no se calcula automáticamente a partir de voltaje. El porcentaje de estabilidad requiere una definición y calibración en el controlador; no se convierte arbitrariamente desde la altura.

Todos los valores son números JSON finitos. Un campo ausente o null significa desconocido. Cada bloque presente debe contener al menos un número y el mensaje debe contener al menos un bloque. Los campos desconocidos se rechazan, para detectar errores de nombres. Un cero es una medición válida y se conserva.

## Relación entre dispositivo y muestra

`sample_id` es único por dispositivo en `ingest_receipts`. Un reintento del mismo mensaje devuelve `duplicate=true` y no vuelve a escribir. El emisor debe mantener ese UUID en cada reintento y generar uno nuevo para una adquisición diferente. La deduplicación no permite completar parcialmente un mensaje con el mismo UUID: envía juntos los bloques de esa adquisición.

Un índice por dispositivo y fecha permite consultar la ventana reciente. El historial general tiene además índice por fecha e id para paginación ordenada. Los tipos `train`, `solar` y `combined` de un dispositivo son etiquetas administrativas; no constituyen restricciones del esquema sobre los bloques que puede enviar.
