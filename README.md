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

Qué **no** monitorea: altura de levitación, estabilidad magnética, temperatura, corriente
y potencia. Las columnas correspondientes (`levitation_height`, `stability`,
`temperature`, `panel_current`, `power_output`, y la tabla `measurements`) siguen en el
esquema **por compatibilidad** con registros anteriores y quedan en `null`. El prototipo
**no tiene sensor de corriente**, así que no hay potencia medida.

El nombre del proyecto se conserva por continuidad académica, pero **no describe el
principio físico del prototipo entregado**.

> **Nada se ha probado con hardware.** No hay ESP32, sensores, panel, batería ni
> instrumentos en el entorno donde se desarrolló esta entrega, y no existe compilador de
> Arduino: el sketch **no se ha compilado ni cargado**. Todas las cifras de la
> documentación son **cálculos teóricos** o **límites de validación del software**, nunca
> mediciones. Ver `documentation/Verificacion.md`.

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
| `Verificacion_Electrica.md` | Multímetro **antes** del firmware: divisores, límites del ADC, batería de litio, panel |
| `Verificacion_Sensores_IR.md` | Nivel activo, alcance, pin por estación, falsas detecciones |
| `Verificacion_LCD_I2C.md` | Dirección I2C, SDA/SCL y convivencia en el bus |
| `Guia_Uso.md` | Uso diario, administración y cómo interpretar los datos |
| `Seguridad.md` | Claves, TLS, rotación de la clave del dispositivo, permisos |
| `Demostracion.md` | Orden de encendido y plan si no hay WiFi en el salón |
| `ARQUITECTURA.md` | Arquitectura y alcance del sistema |
| `Verificacion.md` | Qué está implementado, qué cubren las pruebas y qué falta probar |
| `Calculos_Experimentales.md` | Fórmulas y **tablas de registro vacías** para el informe |
| `Ampliacion_Rapidez_Media.md` | **Diseño propuesto, no implementado**, de la rapidez media del tren |
| `Fuentes_y_Recursos.md` | Documentación oficial y componentes por identificar |

## Pantallas incluidas

| Ruta | Función |
|---|---|
| `/login` | Acceso con Supabase Auth |
| `/dashboard` | Vista general y estado de los subsistemas |
| `/train` | Subsistema ferroviario: detecciones por estación |
| `/solar` | Estación solar: voltajes y batería |
| `/monitoring` | Conexión, última recepción y flujo de lecturas |
| `/history` | Filtros por dispositivo y fecha, orden, paginación y CSV de la página visible |
| `/users` | Creación y edición de usuarios, rol y activación; solo administradores |
| `/settings` | Registro y activación de dispositivos, rotación de claves, contraseña |

> Las vistas `/train` y `/solar` se están adaptando al contrato nuevo. La referencia
> válida de qué dato existe y qué significa es `documentation/Modelo_Datos.md`.

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
- `esp32/MaglevSender/`: medida del panel y de la batería por ADC, y transporte HTTPS de
  lecturas JSON reales.
- `documentation/`: toda la documentación del proyecto.

`node_modules`, `.next`, `.env.local` y `esp32/MaglevSender/config.h` no se versionan.
`config.h` contiene credenciales: **no lo subas al repositorio.**

## Funcionamiento de los datos

Cada dispositivo se consulta por separado y las gráficas no mezclan dispositivos. El
historial consulta la base por páginas de 25 filas y exporta únicamente la página visible,
conservando las fechas en UTC en el CSV.

“LIVE” exige suscripción activa, acceso a Internet, consultas sin error **y** recepción
reciente del dispositivo. Un canal conectado sin mensajes del sensor **no** se presenta
como un sistema operativo. Si Realtime falla, se mantienen consultas cada 15 segundos. Los
valores ausentes aparecen como `—` y el cero real se conserva.

La API exige al menos un bloque de mediciones, guarda todas las partes del mismo mensaje
en una transacción y evita duplicados con `sample_id`. El límite es **un mensaje nuevo por
segundo y por dispositivo**; conviene espaciar los envíos dos segundos o más. En
`train_status`, **`station_number` y `detected` son obligatorios los dos**, y
`detected: false` es la salida del sensor: un evento válido, no una lectura vacía.

Los nombres de las tres estaciones se guardan en la tabla `stations` y se editan desde la
plataforma. El firmware envía **solo el número del sensor**, de modo que renombrar una
estación **no obliga a recargar el firmware**.

## Alcance comprobado

Lo verificado con **pruebas automatizadas** (`npm run check`) es el contrato de datos, la
validación, los permisos de la base y la ingestión, sobre una base PostgreSQL temporal en
memoria. **Eso no prueba nada sobre el hardware.**

Lo que **no** está probado: la compilación y carga del firmware, la lectura de los
sensores infrarrojos, los voltajes del panel y de la batería, la calibración de los
divisores, la pantalla LCD, el circuito magnético del Sistema B y la conexión real del
ESP32. El detalle completo, con lo que queda **[POR CONFIRMAR]** del circuito, está en
`documentation/Verificacion.md`.

No se ha publicado ningún sitio ni se ha modificado un proyecto Supabase externo.

Empieza por `documentation/INDICE.md`.
