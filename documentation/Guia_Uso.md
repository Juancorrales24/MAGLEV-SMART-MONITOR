# Guía de uso de la plataforma

## Consulta diaria

Inicia sesión y selecciona el dispositivo en la barra superior. La selección controla las
vistas de monitoreo; el historial tiene su propio filtro para poder consultar todos los
dispositivos.

Qué muestra el sistema, según el contrato vigente (ver `Modelo_Datos.md`):

- **Detecciones del tren**: qué estación (1, 2 o 3) y si el evento es de llegada
  (`detected = true`) o de salida (`detected = false`), con la fecha de recepción.
- **Estación solar**: voltaje del panel, voltaje de la batería y porcentaje **estimado**
  de batería.
- **Historial**: registros almacenados, con filtros y exportación a CSV.

Qué **no** muestra, porque el prototipo no lo mide: altura de levitación, estabilidad,
temperatura, corriente y potencia. Donde no hay lectura, la interfaz muestra `—`. Un
guion significa **dato desconocido**, no cero.

> Las vistas de tren y de estación solar se están adaptando al contrato nuevo en esta
> misma rama. Si una etiqueta todavía corresponde a la versión con levitación, el dato
> válido es el de la base: consulta `Modelo_Datos.md` y el historial.

## Estado de conexión: qué significa cada indicador

| Indicador | Significado |
|---|---|
| **LIVE** | Hay suscripción Realtime activa, acceso a Internet, consultas sin error **y** recepción reciente del dispositivo |
| **En espera** | La página funciona, pero el dispositivo no ha enviado nada recientemente |
| Última recepción | Fecha del último mensaje aceptado de ese dispositivo |

Un canal conectado **sin mensajes del sensor no se presenta como un sistema operativo**:
eso es intencional. El umbral de antigüedad para LIVE son 60 segundos por defecto
(`NEXT_PUBLIC_STALE_SECONDS`, mínimo 10). Si el canal Realtime se cae, se reconecta
solo y, mientras tanto, una consulta cada 4 segundos (cada 20 segundos como respaldo
con el canal sano) mantiene la vista actualizada mientras haya Internet.

## Historial y exportación

Elige dispositivo, fecha inicial y fecha final, y pulsa **Filtrar**. Las fechas se
interpretan en la zona horaria del navegador; el filtro *Hasta* incluye el minuto
seleccionado completo. Cambia el orden con *Recientes primero* / *Antiguos primero*. Cada
página contiene hasta 25 registros.

**Exportar esta página** genera un CSV separado por punto y coma, con cabecera y
codificación compatible con Excel. Exporta **solo la página visible**: no descarga todo el
historial de una vez. Las fechas del CSV se conservan en UTC, lo que importa para los
cálculos del informe.

## Administrador

### Usuarios

Crea nombre, correo, contraseña inicial de **al menos 12 caracteres** y rol. Las cuentas
creadas desde esta pantalla quedan activas y **no se envía ningún correo automático**:
verifica la identidad antes y entrega las credenciales por un canal apropiado.

Puedes editar rol y activación. **No puedes retirarte tu propio acceso administrativo** ni
desactivar al último administrador: la base lo impide. No hay eliminación de cuentas desde
esta interfaz; para eso se usan las herramientas de Supabase Auth.

### Dispositivos

En **Configuración → Registrar** creas el ESP32 y obtienes su identificador y su clave de
envío. **Copia la clave de inmediato: solo se muestra una vez**, porque el servidor guarda
únicamente su hash. Si la pierdes, usa **Cambiar clave** y actualiza el firmware. El
procedimiento completo está en `Integracion_ESP32.md`.

**Desactivar** un dispositivo detiene la recepción: la API responde 403 a sus mensajes y
los registros existentes se conservan. Recuerda reactivarlo antes de una demostración.

### Nombres de las estaciones

Las tres estaciones tienen un **nombre editable** guardado en la tabla `stations`, con
valores iniciales `Estación 1`, `Estación 2` y `Estación 3`.

Cómo funciona y por qué importa:

- El firmware envía **solo el número del sensor** (`station_number`, 1 a 3), fijado por el
  cableado. **Nunca envía el nombre.**
- El nombre vive en la base de datos y se cambia con la operación administrativa
  `PATCH /api/admin/stations`, que recibe `{ "position": 1-3, "name": "texto" }` y exige
  administrador activo. El nombre admite de 1 a 100 caracteres.
- Por lo tanto, **renombrar una estación no obliga a recompilar ni recargar el firmware**.
- La tabla está publicada en Realtime: el cambio llega al navegador sin recargar.
- Los usuarios activos pueden leer los nombres; no pueden modificarlos directamente.

> La pantalla de administración que usa este endpoint forma parte del trabajo de interfaz
> en curso en esta misma rama. El endpoint **ya existe** y funciona con una sesión de
> administrador; si la pantalla todavía no está, el nombre se puede cambiar llamando a esa
> operación administrativa.

Consejo para la sustentación: pon los nombres que vas a mostrar **antes** de empezar, para
no editar nada en vivo.

## Cuenta personal

Administradores y observadores pueden cambiar su propia contraseña en **Configuración**,
proporcionando la actual. Usa el botón de salida del menú para cerrar sesión.

El acceso a las tablas se aplica mediante **permisos de base de datos**: siguen vigentes
incluso si alguien modifica el código del navegador. Ver `Seguridad.md`.

## Interpretar los datos con honestidad

| Lo que ves | Lo que significa de verdad |
|---|---|
| `—` en una métrica | No hay lectura: dato desconocido. **No es cero.** |
| Un `0` | Es una medición real de cero y se conserva como tal |
| Porcentaje de batería | **Estimación a partir del voltaje**, no una medición directa de carga. Puede variar según la corriente del momento |
| Corriente o potencia del panel | El prototipo **no las mide**: siempre `—` |
| Altura, estabilidad, temperatura | Columnas de compatibilidad de la versión anterior: siempre `—` |
| `detected = false` | Evento de **salida** del sensor, no un fallo ni una lectura vacía |
| Fecha de recepción | Hora en que el **servidor** recibió el mensaje, que puede ser posterior al suceso si hubo reintentos |
| Estado de los LED magnéticos | **No existe en la plataforma**: el Sistema B es independiente y se demuestra físicamente |
| Rapidez del tren | **No existe**: no está implementada. Ver `Ampliacion_Rapidez_Media.md` |
