# MAGLEV SMART MONITOR · V1.1

Aplicación web de monitoreo del tren Maglev y su estación solar. Incluye código fuente completo, autenticación, ocho vistas, consultas, gráficas, actualización en tiempo real, usuarios, dispositivos, API de recepción y scripts SQL.

El diseño sigue la referencia proporcionada: fondo azul oscuro, acentos cian, panel lateral y tarjetas luminosas. La imagen del tren y la estación es una ilustración conceptual, no una fotografía del prototipo. Todas las cifras del panel proceden de la base de datos; no contiene datos precargados, generadores aleatorios ni acceso de demostración.

## Antes de comenzar

Necesitas Node.js 22 o posterior, una cuenta/proyecto Supabase y conexión a Internet para instalar las dependencias. No necesitas sensores para instalar y abrir la web. Sí necesitas configurar Supabase y una cuenta para entrar al monitoreo.

No hay credenciales incorporadas en la entrega. La clave privada de Supabase permanece en el servidor; el ESP32 utiliza una clave independiente por dispositivo.

## Instalación paso a paso

1. Descomprime esta carpeta en tu computador. Abre una terminal dentro de `frontend`.
2. Instala las versiones del archivo de bloqueo:

   ```bash
   npm ci
   ```

3. Copia `frontend/.env.example` como `frontend/.env.local`. En macOS/Linux, desde `frontend`: `cp .env.example .env.local`. En PowerShell: `Copy-Item .env.example .env.local`.
4. En tu proyecto de Supabase, busca Project Settings → API. Completa `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_PRIVADA_DEL_SERVIDOR
   NEXT_PUBLIC_STALE_SECONDS=60
   ```

   La primera clave es la `anon`/publishable pública. La tercera es la `service_role`/secret del servidor. Nunca pongas la clave privada en una variable `NEXT_PUBLIC_`, en el ESP32 ni en un repositorio público.

5. En Supabase → SQL Editor ejecuta, uno a uno y en este orden:

   - `supabase/database.sql`
   - `supabase/policies.sql`
   - `supabase/functions.sql`
   - `supabase/realtime.sql`

6. Crea tu cuenta en Supabase → Authentication → Users → Add user, con correo y contraseña. Confirma el correo desde esa herramienta. No se incluye un formulario público de registro.
7. Abre `supabase/bootstrap_admin.sql`, sustituye `TU_CORREO_AQUI` por el correo que acabas de crear y ejecútalo en SQL Editor. Esto habilita tu perfil como administrador. Los registros de cuentas nuevos quedan inactivos de forma predeterminada hasta la aprobación administrativa.
8. Inicia la web, desde `frontend`:

   ```bash
   npm run dev
   ```

9. Abre [http://localhost:3000](http://localhost:3000). Inicia sesión con la cuenta anterior.
10. En **Configuración → Registrar**, crea el ESP32 y guarda el identificador y la clave de envío. La clave se muestra una sola vez. La página mostrará “Esperando la primera lectura” hasta recibir datos reales.

Si todavía no completas las variables, el login abre y explica qué falta; no produce un error por una URL de Supabase vacía. Reinicia la web después de modificar `.env.local`.

## Pantallas incluidas

| Ruta | Función |
|---|---|
| `/login` | Acceso con Supabase Auth y visualización de contraseña |
| `/dashboard` | Indicadores eléctricos, energía/potencia, estado de módulos y lecturas recientes |
| `/train` | Levitación, estabilidad reportada, temperatura, gráficas y tabla |
| `/solar` | Voltaje/corriente del panel, potencia de salida, batería y registros |
| `/monitoring` | Conexión, última recepción, gráficas y flujo de mediciones |
| `/history` | Filtros por dispositivo/fecha, orden, paginación y CSV de la página visible |
| `/users` | Creación y edición de usuarios, rol y activación; solo administradores |
| `/settings` | Registro/activación de dispositivos, rotación de claves y cambio de contraseña |

## Ejecutar la versión de producción

Desde `frontend`, después de configurar el entorno:

```bash
npm run check
npm run build
npm run start
```

La aplicación requiere un servidor Node.js para `/api/ingest` y `/api/admin/*`. No se puede alojar como un conjunto de archivos estáticos. En un servidor configura las mismas variables antes de compilar y ejecutar. El ESP32 necesita una URL HTTPS alcanzable desde su red; `localhost` en el ESP32 no apunta a tu computador.

## Dónde está cada parte

- `frontend/app/`: rutas, estilos generales y endpoints del servidor.
- `frontend/components/`: navegación, tarjetas, gráficas, tablas, diálogos e ilustración de módulos.
- `frontend/hooks/`: autenticación y ciclo de consultas/Realtime.
- `frontend/lib/`: conexión, tipos, consultas, permisos del servidor, validación y formato.
- `frontend/public/`: imagen incluida y favicon.
- `frontend/tests/`: pruebas aisladas de validación, datos ausentes y CSV; no insertan datos.
- `supabase/`: estructura, políticas, funciones transaccionales, Realtime y primer administrador.
- `esp32/MaglevSender/`: transporte HTTPS de lecturas JSON reales. Ver integración y límites en la documentación.
- `documentation/`: explicación de arquitectura, modelo de datos, instalación, uso, integración y verificación.

No se incluyen `node_modules`, archivos `.next`, contraseñas ni dependencias de la máquina de desarrollo. `npm ci` las instala con las versiones fijadas en `package-lock.json`.

## Funcionamiento de los datos

Cada dispositivo se consulta por separado. Las gráficas muestran hasta 240 lecturas recientes y no mezclan dispositivos. El historial eléctrico consulta la base por páginas de 25 filas; exporta únicamente la página visible y conserva fechas UTC en el CSV. Las tablas de tren y solar muestran 15 registros recientes.

“LIVE” exige una suscripción activa, acceso a Internet, consultas sin error y recepción reciente del dispositivo. Un canal conectado sin mensajes del sensor no se muestra como un sistema operativo. Si falla Realtime, se mantienen consultas cada 15 segundos. Los valores ausentes aparecen como `—`; el cero real se conserva.

La API recibe al menos un bloque de mediciones, guarda todas las partes del mismo mensaje en una transacción y evita duplicados con `sample_id`. El límite es un mensaje nuevo por segundo por dispositivo. Se recomienda enviar cada dos segundos o más.

## Alcance comprobado

La compilación, los tipos y las pruebas locales están descritos en `documentation/Verificacion.md`. La conexión al proyecto Supabase del usuario y las lecturas de hardware requieren completar su configuración; no se presentan como verificadas. No se ha publicado ningún sitio ni modificado un proyecto Supabase externo.

Empieza por `documentation/Instalacion.md` si necesitas una explicación más guiada.
