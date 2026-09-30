# Verificación de la entrega

Revisión local completada el 28 de septiembre de 2026.

## Resultado

La aplicación compila en producción. Los tipos TypeScript, las siete pruebas unitarias y las comprobaciones de permisos e ingestión SQL finalizaron correctamente. Las rutas internas se revisaron en escritorio y celular, sin desbordamiento horizontal ni errores de ejecución de React en los recorridos comprobados.

## Comprobaciones realizadas

| Comprobación | Resultado y alcance |
|---|---|
| `npm run typecheck` | Sin errores de tipos. |
| `npm test` | 7 pruebas aprobadas: cero real, campos ausentes, validación de lecturas y rangos, identificadores, fechas, credenciales iniciales, antigüedad de recepción y exportación CSV. |
| `npm run test:sql` | Scripts de estructura, políticas y funciones ejecutados en una base PostgreSQL local PGlite. Se comprobaron el registro sin privilegios, la ingestión atómica, los reintentos sin duplicados, la lectura por observadores, la protección de secretos, las cuentas inactivas, el acceso anónimo y el bloqueo de dispositivos desactivados. |
| `npm run build` | Compilación de producción completada. Rutas web y los tres endpoints de servidor generados correctamente. |
| Login sin configuración | Presenta instrucciones de configuración y mantiene deshabilitado el inicio de sesión. |
| Endpoints sin autorización | `/api/admin/users`, `/api/admin/devices` y `/api/ingest` rechazaron solicitudes sin credenciales con estado HTTP 401. |
| Escritorio | Revisión de `/dashboard`, `/train`, `/solar`, `/monitoring`, `/history`, `/users` y `/settings` a 1440 px de ancho. |
| Celular | Las mismas siete rutas a 390 × 844 px; navegación mediante el menú móvil comprobada. |
| Diálogo de usuarios | Apertura y cierre con la tecla Escape comprobados. |
| Presentación visual | Inspección de capturas de login, vista general, estación solar y tren en celular; se conservan los tonos azules, cian y la ilustración del proyecto. |
| Dependencias | `package-lock.json` coincide con las dependencias declaradas en `package.json`. |

Las comprobaciones del navegador se hicieron en una copia aislada con una sesión de prueba y respuestas vacías interceptadas. No se conectaron a un proyecto Supabase del usuario ni incorporaron cuentas, claves o mediciones de prueba al código de la aplicación. Las pruebas SQL usan una base temporal que no modifica servicios externos. Los datos sintéticos de prueba, cuando son necesarios para validar reglas, permanecen exclusivamente en las pruebas aisladas.

## Lo que requiere tu configuración

La entrega incluye la aplicación y el transporte HTTPS para ESP32. Para utilizarla, completa las variables del servidor, ejecuta los scripts SQL y crea el primer administrador conforme al README.

Estas comprobaciones aún dependen del entorno real:

- Inicio de sesión, creación de usuarios y dispositivos contra tu proyecto Supabase.
- Actualizaciones Realtime con una publicación PostgreSQL y credenciales reales.
- Acceso HTTPS desde la red del ESP32, certificado raíz y reloj NTP.
- Compilación y carga del firmware para el modelo concreto de placa.
- Lectura de sensores, asignación de pines, calibración y algoritmo de estabilidad, cuyos modelos no fueron especificados.

La revisión local no sustituye esas pruebas de puesta en marcha. La aplicación no incorpora datos de demostración ni muestra el sistema como operativo antes de recibir lecturas recientes.

## Repetir las comprobaciones locales

Dentro de `frontend`, después de `npm ci`:

```bash
npm run check
npm run build
```

Para comprobar el recorrido real, inicia la aplicación, configura Supabase, registra el ESP32 y sigue `Integracion_ESP32.md`. No se ha publicado un sitio ni se han modificado cuentas o bases de datos externas como parte de esta entrega.
