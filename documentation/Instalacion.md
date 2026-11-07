# Instalación y solución de problemas

## Preparar el computador

Instala Node.js 22 o posterior. Comprueba `node --version` y `npm --version` en la
terminal. Abre la carpeta del proyecto en tu editor si quieres revisar o modificar el
código.

En una terminal entra a `frontend` y ejecuta `npm ci`. El comando descarga las librerías
con las versiones fijadas en `package-lock.json`: no hay que copiarlas a mano ni instalar
un backend aparte.

## Preparar Supabase

La instalación está diseñada para un **proyecto Supabase dedicado**.

Ejecuta los cuatro scripts principales en este orden desde el SQL Editor, uno a uno, y
comprueba que cada bloque termina sin errores antes del siguiente:

1. `supabase/database.sql`
2. `supabase/policies.sql`
3. `supabase/functions.sql`
4. `supabase/realtime.sql`

Puedes volver a ejecutarlos: sus operaciones son repetibles para este esquema, y eso está
comprobado en las pruebas automatizadas. Las tablas se crean con **RLS activada** y **sin
datos de demostración**. `supabase/verify.sql` es de solo lectura y permite revisar
tablas, políticas, publicación de Realtime, las columnas del contrato nuevo y que ninguna
función `security definer` de `public` quede expuesta a los clientes.

### Qué crea el esquema para el prototipo actual

- `train_status` recibe dos columnas nuevas: **`station_number`** (1 a 3) y
  **`detected`** (booleano), que son el contrato vigente de los sensores infrarrojos.
- `solar_station` recibe **`battery_voltage`**.
- Se crea la tabla **`stations`** con las tres estaciones y nombres editables
  (`Estación 1`, `Estación 2`, `Estación 3`). La inserción es `on conflict do nothing`:
  **volver a ejecutar el script no sobrescribe un nombre que ya hayas cambiado**.
- Se añade el índice `train_station` para consultar el historial de una estación concreta.
- Las columnas antiguas `levitation_height`, `stability`, `temperature`, `panel_current` y
  `power_output` **se conservan y no se eliminan**, para no destruir registros de la
  versión anterior. El prototipo actual **no las alimenta**: quedan en `null`. Ver
  `Modelo_Datos.md`.

### Migración de la tabla `measurements` anterior

El esquema incorpora una actualización **no destructiva** de la tabla `measurements` del
paquete inicial: le agrega dispositivo, identificador de mensaje y fecha de muestreo. Si
ya existe esa tabla, sus marcas de tiempo sin zona se interpretan como UTC, que es el
valor predeterminado de Supabase. **Respalda primero** si tu proyecto usa otra zona o ha
sido modificado.

Los registros antiguos sin `device_id` permanecen en el historial de "Todos". No se
asignan automáticamente a un sensor ni se muestran como la lectura de un dispositivo.
Vincúlalos solo cuando conozcas su procedencia real. La migración no pretende adaptar
esquemas ajenos al paquete inicial.

### Primer administrador

Crea el usuario en **Authentication → Users → Add user** y ejecuta `bootstrap_admin.sql`
con su correo. Es normal que la cuenta permanezca **inactiva** antes de este paso: el
trigger deja cualquier registro nuevo como observador inactivo, incluso si el registro
incluye metadatos que intenten asignar un rol. Para una instalación privada, deshabilita
además el registro de usuarios nuevos en la configuración de Auth.

## Variables de entorno

| Variable | Uso | Dónde puede estar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto | Navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública anon/publishable | Navegador y servidor, protegida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Administración e ingestión | **Solo servidor** |
| `NEXT_PUBLIC_STALE_SECONDS` | Antigüedad máxima de recepción para LIVE | Navegador; 60 por defecto, mínimo 10 |

Copia `.env.example` a `.env.local`, completa las cuatro variables y reinicia el proceso
de Next.js. Las variables públicas quedan incorporadas durante la compilación: recompila
si las cambias en producción. `.env.local` está excluido de Git.

> **Nunca** pongas la clave de servicio en una variable `NEXT_PUBLIC_`: toda variable con
> ese prefijo se incrusta en el JavaScript que descarga el visitante. Ver `Seguridad.md`.

## Abrir y comprobar

Ejecuta `npm run dev`, abre `http://localhost:3000`, entra con el usuario habilitado y
registra un dispositivo. **Sin datos, la página debe mostrar guiones y mensajes de
espera.** Una pantalla sin cifras es el estado correcto antes de conectar sensores.

Para uso real, compila con `npm run build` y ejecuta con `npm run start`. Usa **HTTPS** en
el alojamiento y configura las mismas variables en el servidor. El ESP32 necesita una URL
HTTPS alcanzable desde su red: `localhost` en el ESP32 no apunta a tu computador.

Comprobaciones locales del repositorio:

```bash
npm run check    # tipos + pruebas de validación + pruebas SQL en PGlite
npm run build
```

## Problemas frecuentes

### Plataforma

| Síntoma | Revisión |
|---|---|
| Login deshabilitado | Faltan la URL o la clave pública. Completa `.env.local` y reinicia. |
| Correo/contraseña no aceptados | Verifica la cuenta en Authentication y el estado de confirmación del correo. |
| Acceso pendiente | Ejecuta `bootstrap_admin.sql` o activa el perfil desde Usuarios. |
| No se pudo cargar perfil | Revisa `database.sql`, el trigger, los permisos y la conexión. |
| Las consultas funcionan pero crear usuario falla | Revisa `SUPABASE_SERVICE_ROLE_KEY` y `functions.sql`. |
| Realtime no conecta | Ejecuta `realtime.sql`, revisa el acceso a WebSockets y los registros del proyecto. La consulta cada 15 s mantiene la vista mientras tanto. |
| No aparecen valores | No hay lecturas para ese dispositivo, el emisor no llegó a la API, o el mensaje no traía ningún bloque. |
| Los nombres de las estaciones no aparecen | Comprueba que `database.sql` creó la tabla `stations` con sus tres filas (`verify.sql` lo muestra). |
| Renombrar una estación devuelve 404 | La `position` debe ser 1, 2 o 3 y la fila debe existir en `stations`. |
| Renombrar una estación devuelve 403 | Hace falta una sesión de **administrador activo**. |

### API de ingestión

| Código | Revisión |
|---|---|
| **400** | Nombres de campos, UUID, tipos, rangos y fechas. En `train_status`, **`station_number` y `detected` son obligatorios los dos**; un campo desconocido también produce 400. |
| **401** | Clave o identificador del dispositivo incorrectos, o clave rotada y no actualizada en `config.h`. |
| **403** | Dispositivo **desactivado** en la plataforma, o usuario sin rol administrativo. |
| **413** | El cuerpo supera 16 KiB. |
| **415** | Falta `Content-Type: application/json`. |
| **429** | Más de un mensaje nuevo por segundo por dispositivo. Espacia los envíos; el emisor reintenta solo. |
| **500 / 503** | Error del servidor o configuración de Supabase incompleta. El emisor **conserva** la muestra y reintenta. |

### ESP32 y hardware

Estos puntos están **[PENDIENTE DE PRUEBA FÍSICA]**: nada se ha probado con hardware.

| Síntoma | Revisión | Documento |
|---|---|---|
| El firmware no arranca y pide completar `config.h` | Falta WiFi, URL HTTPS, identificador, clave o certificado | `Integracion_ESP32.md` |
| No conecta por HTTPS | Certificado raíz, dominio, reloj NTP y conectividad. **No uses `setInsecure()`** | `Seguridad.md` |
| No aparece el puerto serie | Cable solo de carga, controlador USB-serie no instalado, permisos del puerto en Linux | `Integracion_ESP32.md` |
| El monitor serial muestra caracteres raros | Velocidad distinta de **115200** | `Integracion_ESP32.md` |
| La carga falla en `Connecting...` | Mantén pulsado BOOT al iniciar la subida; revisa que no haya un sensor en GPIO0, 2, 12 o 15 | `Integracion_ESP32.md` |
| Una estación muestra el número de otra | Sensores intercambiados en el cableado | `Verificacion_Sensores_IR.md` |
| Detecciones espontáneas sin tren | Ruido, luz ambiente infrarroja, falta de pull-up | `Verificacion_Sensores_IR.md` |
| El voltaje reportado no coincide con el multímetro | Divisor invertido, resistencias distintas, o falta calibrar `CAL_*` | `Verificacion_Electrica.md` |
| `battery_voltage` siempre vacío | El firmware mide la batería pero **hoy no envía ese campo** | `Integracion_ESP32.md` |
| La LCD no muestra nada | Dirección I2C, pines SDA/SCL, contraste, tensión del módulo | `Verificacion_LCD_I2C.md` |
| Puerto 3000 ocupado | `npm run dev -- --port 3001` | — |

Para recuperar una cuenta que olvidó su contraseña, el responsable del proyecto debe usar
las herramientas de Supabase Auth. La web permite cambiar la contraseña conociendo la
actual; no simula un enlace de recuperación sin configuración de correo.
