# Recomendaciones de seguridad

Resumen en una frase: **el ESP32 solo conoce su propia clave; la clave de servicio de
Supabase vive únicamente en el servidor.**

## 1. Las tres clases de credencial de este sistema

| Credencial | Dónde vive | Dónde **nunca** debe estar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Navegador y servidor. Es **pública** por diseño y está protegida por RLS | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo** en el servidor, en `.env.local` o en las variables del alojamiento | En el navegador, en el firmware, en el repositorio, en una captura de pantalla, en el informe |
| `DEVICE_TOKEN` (una por dispositivo) | En `config.h` del ESP32, y como **hash SHA-256** en la base | En el repositorio, en el informe, en un ejemplo de documentación |

## 2. La clave de servicio nunca debe llegar al navegador

La clave de servicio **omite Row Level Security**: con ella se puede leer y escribir
cualquier tabla del proyecto, incluidos los hashes de las claves de los dispositivos.

Por qué no puede llegar al navegador: en Next.js, **toda variable cuyo nombre empieza por
`NEXT_PUBLIC_` se incrusta en el JavaScript que se descarga el visitante**. Ponerla ahí
equivale a publicarla.

- En el repositorio, `frontend/.env.example` la declara como `SUPABASE_SERVICE_ROLE_KEY`,
  **sin** el prefijo `NEXT_PUBLIC_`, con el comentario de que es solo del servidor.
- `frontend/lib/server.ts` empieza con `import 'server-only'`: si alguien intentara
  importar ese módulo desde un componente de cliente, **la compilación falla**. Es una
  barrera del propio código, no solo una recomendación. **[IMPLEMENTADO]**
- Las rutas de API declaran `runtime = 'nodejs'`: se ejecutan en el servidor.

Si alguna vez sospechas que esa clave se expuso, **rótala en Supabase** (Project
settings → API) y actualiza la variable en el servidor. No hay forma de "revocar" una
clave ya publicada sin rotarla.

## 3. No poner claves de Supabase en el firmware

El ESP32 **no habla con Supabase**: habla con tu API (`/api/ingest`), que es la que
tiene la clave de servicio. Esa capa intermedia existe precisamente para esto.

Qué consigue ese diseño:

- El firmware, que es el elemento más expuesto (físicamente accesible, con credenciales
  en texto en la memoria), solo puede **enviar telemetría de un dispositivo**.
- No puede leer la telemetría de otros, ni usuarios, ni claves, ni modificar nada.
- Si alguien extrae el `DEVICE_TOKEN` de la placa, lo peor que puede hacer es **insertar
  lecturas falsas de ese dispositivo**, lo cual se corta desactivándolo o rotando su
  clave.

Qué **no** debe hacerse nunca, aunque parezca más simple:

- Poner `SUPABASE_SERVICE_ROLE_KEY` en `config.h` para "escribir directo en la base".
- Poner la contraseña de una cuenta de la plataforma en el firmware.
- Compartir una misma clave entre varios dispositivos.

## 4. No desactivar la verificación TLS

El sketch usa `tls.setCACert(ROOT_CA)` y **no** usa `setInsecure()`.

Si se desactivara la verificación, cualquiera en la misma red WiFi podría presentar un
certificado propio, hacerse pasar por tu servidor y **capturar el `DEVICE_TOKEN` en el
primer mensaje**, porque viaja en la cabecera `Authorization`. En una red compartida —
la de una institución, por ejemplo — ese riesgo es real, no teórico.

Cuando el ESP32 no conecta por HTTPS, la tentación es `setInsecure()`. **Revisa antes
estas causas**, que son las habituales:

| Causa | Comprobación |
|---|---|
| Certificado raíz equivocado o incompleto | Debe ser la **raíz** de la cadena, en PEM, con las líneas BEGIN/END |
| Certificado caducado o cadena cambiada por el proveedor | Vuelve a exportarlo del navegador |
| Hora del ESP32 no válida | Sin NTP no se puede comprobar la vigencia: el sketch espera a propósito |
| La red bloquea NTP o el dominio | Prueba con otra red, como el punto de acceso del teléfono |
| `API_URL` no empieza por `https://` | El firmware se niega a arrancar |

## 5. Rotación de la clave del dispositivo

Está **[IMPLEMENTADO]** en **Configuración → el dispositivo → Cambiar clave**.

Cómo funciona:

- Se genera una clave nueva, se guarda **solo su hash SHA-256** y se muestra **una sola
  vez**.
- La clave anterior **deja de funcionar de inmediato**: el ESP32 recibirá **401** y
  **descartará** las muestras hasta que actualices `config.h` y recargues el firmware.
- Afecta **solo** a ese dispositivo.
- Los registros ya guardados se conservan.

Cuándo rotar:

- Si la clave se mostró en una presentación, una captura, un correo o un chat.
- Si el `config.h` de alguien se subió al repositorio por error.
- Si la placa estuvo fuera de tu control.
- Como cierre del proyecto, si la placa va a quedar en manos de otra persona.

Antes de entregar o publicar cualquier material del proyecto, revisa que no aparezcan
credenciales en capturas de pantalla del diálogo de registro de dispositivos ni en el
monitor serial.

## 6. Comparación de la clave sin filtrar información

`frontend/app/api/ingest/route.ts` compara el hash SHA-256 del token recibido con el
almacenado usando `timingSafeEqual`, una comparación de **tiempo constante**. Una
comparación normal termina antes cuando los primeros bytes difieren, y esa diferencia de
tiempo puede usarse para adivinar la clave byte a byte. **[IMPLEMENTADO]**

Por el mismo motivo, el mensaje de error es idéntico — *Credenciales del dispositivo
inválidas* — tanto si el identificador no existe como si la clave no coincide: no
confirma a un atacante qué parte acertó.

## 7. Permisos de la base de datos

Verificado por `frontend/scripts/check-sql.mjs` (**[PRUEBAS AUTOMATIZADAS]**, no es una
prueba con hardware):

- **RLS activada** en todas las tablas del proyecto desde el primer script.
- Los clientes autenticados **solo leen**: no hay ninguna política de `insert`, `update`
  ni `delete`. Todas las mutaciones pasan por la API, que valida la sesión.
- `device_credentials` e `ingest_receipts` tienen **políticas restrictivas de
  denegación** para `anon` y `authenticated`: siguen bloqueadas aunque alguien conceda
  privilegios o añada por error una política permisiva.
- Las funciones auxiliares de RLS viven en un esquema **no expuesto** por la API de
  Supabase, para que no se puedan invocar como RPC.
- Las cuentas nuevas nacen **observadoras e inactivas**, incluso si el registro incluye
  metadatos que intenten asignarse un rol. Está comprobado en las pruebas.
- Un **usuario inactivo no accede a la telemetría**.
- No hay acceso **anónimo** a ninguna tabla.
- `admin_update_profile` impide **quedarse sin el último administrador** y que un
  administrador se retire a sí mismo el acceso.

## 8. Buenas prácticas de operación

| Práctica | Motivo |
|---|---|
| Un dispositivo registrado **por placa física** | Rotar o desactivar uno no afecta a los demás |
| **Desactivar** el dispositivo cuando el prototipo no se usa | La API rechaza con 403 cualquier envío, incluso con la clave correcta |
| Contraseñas de cuenta de **12 caracteres o más** | Lo exige la validación del servidor |
| Revisar la lista de **usuarios activos** antes de entregar | Un observador activo ve toda la telemetría de la instalación |
| Usar **HTTPS real** en el despliegue | El firmware se niega a usar HTTP y la verificación TLS depende de ello |
| No publicar el `.env.local` ni el `config.h` | Están excluidos del control de versiones; confírmalo con `git status` |

## 9. Lo que este sistema **no** hace

Para que nadie lo presente como una garantía que no existe:

- **No cifra** los datos una vez almacenados más allá de lo que haga Supabase por
  defecto.
- **No tiene** auditoría de accesos ni alertas por correo.
- **No detecta** un dispositivo suplantado si alguien obtuvo su clave legítima: lo único
  que se puede hacer es rotarla o desactivarlo.
- **No garantiza** que ninguna muestra se pierda: el emisor no tiene cola persistente.
- **No valida** que las lecturas sean *físicamente correctas*: valida que estén dentro
  de los rangos del formato. Un sensor mal calibrado produce datos válidos para la API y
  falsos para el informe. Por eso existen las guías de verificación.
