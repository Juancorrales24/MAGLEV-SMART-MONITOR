> **PRIMERO:** [Guía paso a paso ESP32 ↔ MAGLEV](GUIA_PASO_A_PASO_ESP32_MAGLEV.md) — carga, monitor local, Supabase, GitHub y envío HTTPS.

# Índice de la documentación

Proyecto académico **MAGLEV SMART MONITOR** — Electromagnetismo, Unidades Tecnológicas de
Santander, grupo B193.

> **Advertencia de alcance, válida para toda la documentación:** el prototipo **ya no usa
> levitación magnética**: el tren circula sobre ruedas sobre rieles convencionales. El
> firmware ya se cargó en el ESP32 real y el prototipo **envía datos a la plataforma en
> producción**. Lo que sigue sin instrumentos (multímetro, calibración de los divisores)
> permanece marcado **[POR CONFIRMAR]**, y las cifras sin medición siguen siendo cálculos
> teóricos o límites de validación, indicados como tales.

## Empieza por aquí

| Si quieres… | Lee |
|---|---|
| Entender qué construyó el técnico y con qué componentes | `Hardware_Prototipo.md` |
| Instalar la plataforma web y la base de datos | `Instalacion.md` |
| Saber exactamente qué datos viajan y en qué formato | `Modelo_Datos.md` |
| Registrar el ESP32 y cargar el firmware | `Integracion_ESP32.md` |
| Usar la plataforma día a día | `Guia_Uso.md` |

## Con el hardware en las manos

| Documento | Para qué |
|---|---|
| `Verificacion_Electrica.md` | Multímetro **antes** de cargar el firmware: panel, batería, módulo cargador, divisores resistivos, límites del ADC y calibración |
| `Verificacion_Sensores_IR.md` | Nivel activo, alcance, qué pin es cada estación y falsas detecciones por ruido |
| `Verificacion_LCD_I2C.md` | Dirección I2C, pines SDA/SCL, niveles del bus y convivencia con otros dispositivos |
| `Integracion_ESP32.md` | Soporte de placa, bibliotecas, selección de puerto, monitor serial a 115200 |
| `Demostracion.md` | Orden de encendido, revisión previa y qué hacer si no hay WiFi en el salón |

## Referencia técnica

| Documento | Contenido |
|---|---|
| `ARQUITECTURA.md` | Recorrido de una lectura, frontend, backend, permisos, alcance |
| `Modelo_Datos.md` | Tablas, columnas, unidades, rangos, qué significa `null`, tabla `stations`, contrato JSON con ejemplos y códigos HTTP reales |
| `Seguridad.md` | Claves de servicio, TLS, rotación de la clave del dispositivo, permisos de la base |
| `Verificacion.md` | Qué está implementado, qué cubren las pruebas automatizadas y qué sigue pendiente de prueba física |
| `Fuentes_y_Recursos.md` | Documentación oficial consultada y qué falta identificar de cada componente |

## Para el informe académico

| Documento | Contenido |
|---|---|
| `Calculos_Experimentales.md` | Fórmulas, procedimientos y **tablas de registro vacías**: divisor teórico vs experimental con error porcentual, voltajes de panel y batería, calibración, pruebas de los sensores IR, rapidez media y distancia de activación magnética |
| `Ampliacion_Rapidez_Media.md` | Diseño original de la rapidez media, **ya implementada**, con la justificación de por qué los tiempos se miden con un temporizador monotónico local del ESP32 |

## Los tres subsistemas del prototipo

| Sistema | Qué es | Llega a la web |
|---|---|---|
| **A — Detección ferroviaria** | Tren sobre rieles, 3 estaciones, 3 sensores infrarrojos, ESP32, LCD 1602 I2C, WiFi | **Sí**: eventos `train_status` con `station_number` y `detected` |
| **B — Iluminación magnética** | Elementos magnéticos + imanes + LED. **Circuito independiente del ESP32** | **No.** La web no recibe el estado de esos LED; se demuestra físicamente |
| **C — Estación solar** | Panel 6 V nominales, batería 18650, módulo cargador HW-373, 2 divisores resistivos (100 kΩ + 47 kΩ) | **Sí**: `solar_station` con voltaje de panel, voltaje de batería y porcentaje estimado |

## Lo que el sistema NO hace

- No mide altura de levitación, estabilidad ni temperatura: esas columnas existen **por
  compatibilidad** con registros anteriores y quedan en `null`.
- No mide **corriente ni potencia**: no hay sensor de corriente en el prototipo.
- No conoce el estado de los LED del Sistema B.
- No controla el tren: ni tracción, ni frenado.

## Marcas de estado usadas en los documentos

| Marca | Significado |
|---|---|
| **[IMPLEMENTADO]** | Existe en el código de este repositorio |
| **[PRUEBAS AUTOMATIZADAS]** | Cubierto por `npm run check`. **No es una prueba con hardware** |
| **[PENDIENTE DE PRUEBA FÍSICA]** | Nunca se ha ejecutado con el circuito real |
| **[POR CONFIRMAR]** / **[POR VERIFICAR]** | Dato del prototipo que hay que comprobar con el circuito en la mano |
