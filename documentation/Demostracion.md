# Preparar la demostración real del proyecto

Guía operativa para el día de la sustentación. El sistema completo ya funcionó en
ensayos reales (tren detectado por los tres sensores, LCD y web en vivo); aun así, el
valor de este documento es el orden y las decisiones tomadas de antemano, no una
garantía de que todo funcionará ese día.

## 1. Con días de antelación

| Tarea | Documento |
|---|---|
| Verificación eléctrica con multímetro y calibración de `CAL_*` | `Verificacion_Electrica.md` |
| Nivel activo, pines y alcance de los tres sensores infrarrojos | `Verificacion_Sensores_IR.md` |
| Dirección I2C y escritura en la LCD | `Verificacion_LCD_I2C.md` |
| Dispositivo registrado; `DEVICE_ID` y `DEVICE_TOKEN` en `config.h` | `Integracion_ESP32.md` |
| Scripts SQL ejecutados y primer administrador habilitado | `Instalacion.md` |
| Nombres de las tres estaciones puestos como quieras mostrarlos | `Guia_Uso.md` |
| Registros de mediciones anotados para el informe | `Calculos_Experimentales.md` |

Además:

- **Carga la batería 18650** con antelación y anota su voltaje de partida.
- Comprueba el **certificado raíz**: si caducó o el proveedor cambió la cadena, el ESP32
  no conectará y el síntoma parece un fallo de WiFi.
- Haz **una pasada completa del tren** por las tres estaciones y comprueba que el
  historial refleja el recorrido real, con los números de estación correctos.
- Prepara una **captura de pantalla reciente** del panel con datos reales. Es tu respaldo
  si la red falla.

## 2. Qué llevar

- [ ] Prototipo completo: vía, tren, tres sensores, LCD, ESP32.
- [ ] Sistema C: panel, batería, módulo cargador, los dos divisores.
- [ ] Sistema B: imanes y el circuito de LED.
- [ ] Cable USB **de datos** (no solo de carga) y un segundo cable de repuesto.
- [ ] Computador con Arduino IDE, el proyecto y `config.h` ya configurado.
- [ ] **Multímetro.**
- [ ] Teléfono con **punto de acceso WiFi** configurado y probado.
- [ ] Lámpara o linterna, si el panel necesita más luz que la del salón.
- [ ] Capturas de pantalla de respaldo y las tablas de mediciones impresas o a mano.
- [ ] Cinta, destornillador pequeño, cables de repuesto.

## 3. Orden de encendido

Un orden fijo evita conectar un divisor a un pin que ya está energizado y evita
diagnosticar al revés.

1. **Inspección visual**, todo apagado: cables sueltos, polaridad de la batería, nada en
   corto, sensores en su sitio.
2. **Multímetro**: voltaje de la batería y del panel. Si el panel está muy por debajo de
   lo habitual, el problema es la luz, no el sistema.
3. **Red**: enciende el punto de acceso o confirma la red del salón **antes** de encender
   la placa. El ESP32 reintenta cada 10 s, así que si la red aparece después también
   conectará, pero verificarlo primero ahorra tiempo.
4. **Sistema C**: conecta panel → módulo cargador → batería. Comprueba que el módulo
   indica carga.
5. **ESP32**: aliméntalo. Abre el **monitor serial a 115200** en el computador.
6. **Espera el arranque**: debe aparecer el mensaje de arranque del firmware, luego la
   conexión WiFi, la hora NTP y el primer `OK: lectura recibida.` Si se queda en
   `Completa config.h`, falta un campo de configuración.
7. **Plataforma**: inicia sesión, selecciona el dispositivo y confirma que la **última
   recepción** es reciente.
8. **Sistema A**: pasa el tren por cada estación y comprueba que el evento aparece con el
   número correcto.
9. **Sistema B**: acerca el imán y muestra que el LED de la estación se enciende. Di
   explícitamente que **ese circuito es independiente del ESP32 y que la web no recibe su
   estado**: se demuestra físicamente.
10. **LCD**: confirma que muestra lo que debe mostrar.

## 4. Revisión final, cinco minutos antes

- [ ] Sesión **ya iniciada** en la plataforma, en la vista que vas a mostrar primero.
- [ ] El dispositivo seleccionado en la barra superior es el correcto.
- [ ] La **última recepción** es de hace segundos, no de ayer.
- [ ] El dispositivo está **habilitado** (si lo desactivaste en pruebas, reactívalo).
- [ ] Tren en el punto de partida.
- [ ] Monitor serial abierto: es tu mejor herramienta de diagnóstico en vivo.
- [ ] Batería con carga suficiente para toda la sustentación.
- [ ] Capturas de respaldo abiertas en otra pestaña.
- [ ] Brillo de pantalla y zoom del navegador ajustados para que se vea desde lejos.

## 5. Si no hay WiFi en el salón

Este es el escenario más probable y el que hay que tener resuelto de antemano. En orden
de preferencia:

### Plan A — Punto de acceso del teléfono

1. Activa el punto de acceso **antes** de llegar.
2. El `WIFI_SSID` y `WIFI_PASSWORD` de `config.h` deben ser los del **punto de acceso**,
   no los de la red de la institución. Decide esto con antelación: cambiarlos exige
   **recompilar y recargar** el firmware, que lleva varios minutos.
3. El ESP32 suele conectar solo a **2.4 GHz**: configura el punto de acceso en esa banda
   si el teléfono lo permite. **[POR CONFIRMAR]** según el modelo de placa y de teléfono.
4. El computador puede ir por la misma red o por datos: la web es pública en Internet.

> Consejo práctico: ten el firmware ya cargado con los datos del **punto de acceso del
> teléfono**, no con los de la red de la institución. Es la red que controlas tú.

### Plan B — Demostrar el prototipo y la plataforma por separado

Si no hay ninguna red, **no improvises y no finjas**:

1. Demuestra el **prototipo físico**: paso del tren por los tres sensores, LCD
   respondiendo, LED magnéticos del Sistema B encendiéndose.
2. Muestra el **monitor serial**, que prueba que el firmware **detecta y arma los
   mensajes** aunque no pueda enviarlos. El comportamiento del firmware ante un fallo de
   red es parte del diseño: conserva la muestra y reintenta con espera creciente.
3. Muestra la **plataforma con las capturas de respaldo** y explica con claridad que son
   **registros de una prueba anterior**, no datos en vivo.
4. Enseña el **historial** de la plataforma, que son datos reales ya almacenados.

### Qué NO hacer

- **No** desactivar la verificación TLS para "que funcione": expone la clave del
  dispositivo. Ver `Seguridad.md`.
- **No** inyectar lecturas inventadas por el puerto serie para que el panel muestre
  cifras. Serían datos falsos en una base de datos presentada como real.
- **No** presentar las capturas de respaldo como datos en vivo.
- **No** afirmar que un subsistema funciona si no lo acabas de demostrar.

## 6. Diagnóstico rápido durante la demostración

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| El monitor serial no muestra nada | Velocidad distinta de 115200, puerto equivocado | Ajusta la velocidad; pulsa EN/RST |
| Se queda en `Completa config.h` | Falta WiFi, URL, id, clave o certificado | No se arregla en vivo: usa el Plan B |
| No llega a enviar y no reporta error | Esperando WiFi u hora NTP | Verifica la red; espera unos segundos |
| `REINTENTO HTTP 429` | Dos mensajes en el mismo segundo | Normal: espacia los eventos, el dato llega |
| `REINTENTO HTTP` con 5xx | Servidor o Supabase no responden | Reintenta solo; revisa Internet |
| `ERROR HTTP 401` | Clave o identificador equivocados; clave rotada y no actualizada | No se arregla en vivo: Plan B |
| `ERROR HTTP 403` | Dispositivo **desactivado** en la plataforma | Actívalo en Configuración |
| `ERROR HTTP 400` | Bloque incompleto o campo desconocido | Revisa el JSON que entra por serie |
| Falla el saludo TLS | Certificado raíz caducado o cadena cambiada; sin NTP | No se arregla en vivo: Plan B |
| La web no dice LIVE pero hay datos | Más de 60 s sin recepción, o Realtime sin conectar | Espera el siguiente envío; con Realtime caído la consulta de respaldo refresca cada 4 s |
| Una estación muestra el número de otra | Sensores intercambiados en el cableado | Dilo con honestidad; corrige después |
| Voltaje del panel muy bajo | Poca luz | Acerca la lámpara; explica la dependencia de la iluminación |
| El porcentaje de batería salta | Es una **estimación por voltaje**, sensible a la corriente del momento | Explícalo así, es el comportamiento esperado |

## 7. Qué decir sobre el alcance, si lo preguntan

Respuestas honestas y verificables:

- El prototipo **no levita**: el tren va sobre ruedas y su paso se detecta con sensores
  infrarrojos. Las columnas de levitación siguen en la base por **compatibilidad** con
  registros anteriores y **no se alimentan**.
- El sistema **no mide corriente ni potencia**: no hay sensor de corriente. `panel_current`
  y `power_output` quedan en `null` y la web los muestra como `—`.
- El porcentaje de batería es una **estimación a partir del voltaje**, no una medición
  directa de carga.
- Los LED magnéticos del Sistema B son un **circuito independiente**: la web no recibe su
  estado y el encendido se demuestra físicamente.
- El sistema **no calcula rapidez** del tren. Hay un **diseño propuesto y no
  implementado** en `Ampliacion_Rapidez_Media.md`, con la razón técnica de por qué los
  tiempos deben medirse en el ESP32 y no con las horas de llegada de los mensajes.
- Los valores de ejemplo de la documentación son **estructura del formato**, no
  mediciones.
- Lo que está comprobado **con pruebas automatizadas** es el contrato de datos, los
  permisos de la base y la ingestión. Lo que está comprobado **con hardware** es lo que
  tú hayas medido y anotado: ni un dato más.
