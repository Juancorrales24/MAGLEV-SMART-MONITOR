# MAGLEV SMART MONITOR

Plataforma web de monitoreo de un prototipo ferroviario y su estación solar, con
recepción de datos reales desde un ESP32. Incluye código fuente completo,
autenticación, vistas de monitoreo, consultas, gráficas, actualización en tiempo real,
gestión de usuarios y dispositivos, API de recepción y scripts SQL.

## El prototipo real: sobre ruedas, no levitando

**El prototipo físico cambió respecto al diseño original. Ya no hay levitación
magnética:** el tren circula **sobre ruedas, sobre rieles convencionales**, y su paso se
detecta con **tres sensores infrarrojos**, uno por estación.

Qué monitorea el sistema:

| Subsistema | Qué llega a la plataforma |
|---|---|
| **A — Detección ferroviaria** | Eventos de los sensores infrarrojos: número de estación (1–3) y si es llegada o salida |
| **B — Iluminación magnética** | **Nada.** Es un circuito independiente del ESP32; la web no recibe el estado de esos LED y se demuestra físicamente |
| **C — Estación solar** | Voltaje del panel, voltaje de la batería y porcentaje **estimado** de batería |
| **Tiempos y rapidez** | Tiempo entre estaciones y tiempo de vuelta medidos por el ESP32; rapidez media si las distancias de los tramos están configuradas en la web |
| **Salud del ESP32** | Autodiagnóstico cada ~30 s: motivo del último arranque, tiempo encendido, señal WiFi, memoria libre y descartes de su cola |

Qué **no** monitorea: altura de levitación, estabilidad magnética, temperatura, corriente
y potencia. Las columnas correspondientes (`levitation_height`, `stability`,
`temperature`, `panel_current`, `power_output`, y la tabla `measurements`) siguen en el
esquema **por compatibilidad** con registros anteriores y quedan en `null`. El prototipo
**no tiene sensor de corriente**, así que no hay potencia medida.

El nombre del proyecto se conserva por continuidad académica, pero **no describe el
principio físico del prototipo entregado**.

> **Estado actual: el prototipo físico ya funciona.** El firmware se compiló y cargó con
> Arduino IDE en el ESP32 real, que detecta el tren con los tres sensores infrarrojos,
> muestra la estación en la pantalla LCD 1602 y envía datos reales por HTTPS a la
> plataforma desplegada en producción. Las verificaciones que requieren instrumentos
> (multímetro, calibración de los divisores) siguen **[POR CONFIRMAR]**: ver
> `documentation/Verificacion.md`.

Todas las cifras del panel proceden de la base de datos. No hay datos precargados,
generadores aleatorios ni acceso de demostración.

## Antes de comenzar

Necesitas Node.js 22 o posterior, un proyecto de Supabase y conexión a Internet para
instalar las dependencias. **No necesitas sensores para instalar y abrir la web**; sí
necesitas configurar Supabase y una cuenta para entrar al monitoreo.

No hay credenciales incorporadas en la entrega. La clave privada de Supabase permanece en
el servidor; el ESP32 usa una clave independiente por dispositivo.

## Instalación paso a paso

1. Abre una terminal dentro de `frontend`.
2. Instala las versiones del archivo de bloqueo:

   ```bash
   npm ci
   ```

3. Copia `frontend/.env.example` como `frontend/.env.local`. En macOS/Linux, desde
   `frontend`: `cp .env.example .env.local`. En PowerShell:
   `Copy-Item .env.example .env.local`.
4. En tu proyecto de Supabase, busca Project settings → API. Completa `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_PRIVADA_DEL_SERVIDOR
   NEXT_PUBLIC_STALE_SECONDS=60
   ```

   La primera clave es la `anon`/publishable, pública. La tercera es la `service_role`,
   secreta y **solo del servidor**. Nunca pongas la clave privada en una variable
   `NEXT_PUBLIC_`, en el ESP32 ni en un repositorio público.

5. En Supabase → SQL Editor ejecuta, uno a uno y en este orden:

   - `supabase/database.sql`
   - `supabase/policies.sql`
   - `supabase/functions.sql`
   - `supabase/realtime.sql`

6. Crea tu cuenta en Supabase → Authentication → Users → Add user, con correo y
   contraseña, y confirma el correo desde esa herramienta. No se incluye un formulario
   público de registro.
7. Abre `supabase/bootstrap_admin.sql`, sustituye `TU_CORREO_AQUI` por ese correo y
   ejecútalo. Eso habilita tu perfil como administrador. Las cuentas nuevas quedan
   **inactivas** de forma predeterminada hasta la aprobación administrativa.
8. Inicia la web, desde `frontend`:

   ```bash
   npm run dev
   ```

9. Abre [http://localhost:3000](http://localhost:3000) e inicia sesión.
10. En **Configuración → Registrar**, crea el ESP32 y guarda su identificador y su clave
    de envío. **La clave se muestra una sola vez.** La página indicará que espera la
    primera lectura hasta recibir datos reales.

Si todavía no completas las variables, el login abre y explica qué falta. Reinicia la web
después de modificar `.env.local`.

## Documentación

Empieza por **`documentation/INDICE.md`**, que organiza todo lo demás.

| Documento | Contenido |
|---|---|
| `Hardware_Prototipo.md` | Los tres subsistemas, componentes, pines y el divisor resistivo |
| `Instalacion.md` | Instalación guiada y solución de problemas |
| `Modelo_Datos.md` | Tablas, unidades, rangos, tabla `stations`, contrato JSON con ejemplos y códigos HTTP |
| `Integracion_ESP32.md` | Registro del dispositivo, `config.h`, bibliotecas y carga con Arduino IDE |
| `GUIA_PASO_A_PASO_ESP32_MAGLEV.md` | Guía paso a paso: ESP32 físico, web, Supabase y GitHub |
| `Verificacion_Electrica.md` | Multímetro **antes** del firmware: divisores, límites del ADC, batería de litio, panel |
| `Verificacion_Sensores_IR.md` | Nivel activo, alcance, pin por estación, falsas detecciones |
| `Verificacion_LCD_I2C.md` | Dirección I2C, SDA/SCL y convivencia en el bus |
| `Guia_Uso.md` | Uso diario, administración y cómo interpretar los datos |
| `Seguridad.md` | Claves, TLS, rotación de la clave del dispositivo, permisos |
| `Demostracion.md` | Orden de encendido y plan si no hay WiFi en el salón |
| `ARQUITECTURA.md` | Arquitectura y alcance del sistema |
| `Verificacion.md` | Qué está implementado, qué cubren las pruebas y qué falta probar |
| `Calculos_Experimentales.md` | Fórmulas y **tablas de registro vacías** para el informe |
| `Ampliacion_Rapidez_Media.md` | Diseño inicial de la rapidez media, **ya implementada**; se conserva como historia del diseño |
| `Fuentes_y_Recursos.md` | Documentación oficial y componentes por identificar |

## Pantallas incluidas

| Ruta | Función |
|---|---|
| `/login` | Acceso con Supabase Auth |
| `/dashboard` | Vista general y estado de los subsistemas |
| `/train` | Subsistema ferroviario: detecciones por estación, tiempos de tramo, tiempo de vuelta y rapidez media |
| `/solar` | Estación solar: voltajes y batería |
| `/monitoring` | Conexión, última recepción, flujo de lecturas y salud del ESP32 |
| `/history` | Filtros por dispositivo y fecha, orden, paginación y CSV de la página visible |
| `/users` | Creación y edición de usuarios, rol y activación; solo administradores |
| `/settings` | Dispositivos, rotación de claves, nombres y distancias de las estaciones, contraseña |

> La referencia válida de qué dato existe y qué significa es
> `documentation/Modelo_Datos.md`.

## Ejecutar la versión de producción

Desde `frontend`, después de configurar el entorno:

```bash
npm run check
npm run build
npm run start
```

La aplicación requiere un servidor Node.js para `/api/ingest` y `/api/admin/*`: no se
puede alojar como archivos estáticos. Configura las mismas variables en el servidor antes
de compilar. El ESP32 necesita una URL **HTTPS** alcanzable desde su red; `localhost` en
el ESP32 no apunta a tu computador.

## Dónde está cada parte

- `frontend/app/`: rutas, estilos y endpoints del servidor
  (`/api/ingest`, `/api/admin/users`, `/api/admin/devices`, `/api/admin/stations`).
- `frontend/components/`: navegación, tarjetas, gráficas, tablas y diálogos.
- `frontend/hooks/`: autenticación y ciclo de consultas/Realtime.
- `frontend/lib/`: conexión, tipos, consultas, permisos del servidor, validación, formato.
- `frontend/tests/` y `frontend/scripts/check-sql.mjs`: pruebas de validación y de
  permisos/ingestión SQL sobre una base temporal en memoria. No insertan datos en
  Supabase.
- `supabase/`: estructura, políticas, funciones transaccionales, Realtime y primer
  administrador.
- `esp32/MaglevSender/`: sensores IR con antirrebote, pantalla LCD 1602 I2C con los
  nombres de estación en vivo, medida del panel y de la batería por ADC, cola con
  reintentos, conexión TLS persistente y autodiagnóstico; si `config.h` está incompleto,
  arranca un monitor local en su propia red WiFi (página `/datos`).
- `esp32/MaglevDiagnostico/`: diagnóstico de sensores y WiFi sin instrumentos.
- `documentation/`: toda la documentación del proyecto.

`node_modules`, `.next`, `.env.local` y `esp32/MaglevSender/config.h` no se versionan.
`config.h` contiene credenciales: **no lo subas al repositorio.**

## Funcionamiento de los datos

Cada dispositivo se consulta por separado y las gráficas no mezclan dispositivos. El
historial consulta la base por páginas de 25 filas y exporta únicamente la página visible,
conservando las fechas en UTC en el CSV.

“LIVE” exige suscripción activa, acceso a Internet, consultas sin error **y** recepción
reciente del dispositivo. Un canal conectado sin mensajes del sensor **no** se presenta
como un sistema operativo. Si el canal de
Realtime se cae, se reconecta solo y, mientras tanto, la web consulta cada 4 segundos
(cada 20 segundos como respaldo cuando el canal está sano). Los
valores ausentes aparecen como `—` y el cero real se conserva.

La API exige al menos un bloque de mediciones, guarda todas las partes del mismo mensaje
en una transacción y evita duplicados con `sample_id`. El límite del servidor es **un
mensaje nuevo cada 400 ms por dispositivo**; el firmware espacia sus envíos 500 ms o
más. En
`train_status`, **`station_number` y `detected` son obligatorios los dos**, y
`detected: false` es la salida del sensor: un evento válido, no una lectura vacía.

Los nombres de las tres estaciones se guardan en la tabla `stations` y se editan desde la
plataforma. El firmware envía **solo el número del sensor**, de modo que renombrar una
estación **no obliga a recargar el firmware**. La respuesta de cada envío devuelve los
nombres vigentes, así que la pantalla LCD del prototipo también muestra el nombre nuevo
en vivo.

Además del evento de paso, `train_status` guarda el tiempo desde la estación anterior y
el tiempo de vuelta completa, medidos con el reloj interno del ESP32 (`millis()`), nunca
con la hora de llegada al servidor. Con las distancias de los tramos configuradas en
**Configuración → Estaciones de la vía**, la web calcula la rapidez media. La tabla
`device_health` guarda el autodiagnóstico que el ESP32 envía cada ~30 s.

## Alcance comprobado

Lo verificado con **pruebas automatizadas** (`npm run check`) es el contrato de datos, la
validación, los permisos de la base y la ingestión, sobre una base PostgreSQL temporal en
memoria. **Eso no prueba nada sobre el hardware.**

Ya comprobado con el hardware real: la compilación y carga del firmware, la detección
del tren por los tres sensores infrarrojos, la pantalla LCD y el envío por HTTPS hasta
la plataforma en producción. Lo que sigue **sin** verificar con instrumentos: la
calibración de los divisores y la exactitud de los voltajes del panel y de la batería
(no hay multímetro) y el circuito magnético del Sistema B. El detalle, con lo que queda
**[POR CONFIRMAR]**, está en `documentation/Verificacion.md`.

La plataforma está desplegada en producción (Vercel + Supabase) y recibe los datos del
prototipo real.

Empieza por `documentation/INDICE.md`.
