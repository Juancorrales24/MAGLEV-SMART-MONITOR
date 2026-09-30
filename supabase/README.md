# Instalar la base

Ejecuta `database.sql`, `policies.sql`, `functions.sql` y `realtime.sql` en este orden desde SQL Editor. Crea la cuenta en Authentication, edita el correo de `bootstrap_admin.sql` y ejecútalo. `verify.sql` es de solo lectura y ayuda a comprobar la instalación.

No hay datos de demostración. Los clientes no escriben directamente en tablas. La API del servidor valida al administrador o dispositivo y utiliza las funciones con una clave privada. No publiques `device_credentials` ni `ingest_receipts` en Realtime.

Para migrar la tabla measurements del ZIP básico, database.sql añade campos sin borrar filas; sus fechas sin zona se consideran UTC. Los registros sin dispositivo permanecen en el historial general. Consulta `documentation/Instalacion.md` antes de aplicarlo a otra estructura existente.
