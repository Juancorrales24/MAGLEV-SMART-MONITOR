# Guía de uso

## Consulta diaria

Inicia sesión y selecciona el dispositivo en la barra superior. La selección controla Dashboard, Tren, Solar y Tiempo real. El historial tiene su propio filtro para permitir consultar todos los dispositivos.

En Dashboard consulta las cuatro variables eléctricas. Usa los botones Energía y Potencia para cambiar la gráfica. El panel de módulos muestra la última lectura de levitación, estabilidad y batería con su fecha. No hay porcentajes de “salud del sistema” calculados sin una regla definida.

Tren presenta altura, estabilidad y temperatura junto a la ilustración conceptual. Solar presenta variables del panel, batería y potencia de salida. Las tablas permiten consultar los valores de las gráficas.

Tiempo real informa por separado el canal de actualización y la última recepción del dispositivo. “En espera” no significa un fallo de la página: puede indicar que los sensores todavía no envían lecturas. Si el canal no logra conectarse, la consulta periódica mantiene la vista actualizada cuando Internet está disponible.

## Historial y exportación

Elige dispositivo, fecha inicial y fecha final; pulsa Filtrar. Las fechas se interpretan en la zona horaria del navegador. Cambia el orden con “Recientes primero”/“Antiguos primero”. Cada página contiene hasta 25 registros. “Exportar esta página” genera CSV separado por punto y coma con cabecera y codificación UTF-8 compatible con Excel. No descarga todo el historial automáticamente.

## Administrador

En Usuarios crea nombre, correo, contraseña inicial de al menos 12 caracteres y rol. Las cuentas creadas desde esta pantalla quedan activas; no se envía un correo automático. Verifica previamente la identidad y entrega las credenciales por un canal apropiado. Edita rol y activación. No puedes quitarte tu propio acceso administrativo. No existe eliminación de cuentas desde esta interfaz.

En Configuración registra el dispositivo. Copia su UUID y clave de inmediato: el servidor no conserva la clave legible, solo su hash. Si la pierdes, utiliza Cambiar clave y actualiza el firmware. Al desactivar un dispositivo sus registros se conservan, pero la API rechaza nuevas lecturas.

## Cuenta personal

Administradores y observadores pueden cambiar su propia contraseña en Configuración, proporcionando la actual. Usa el botón de salida del menú para cerrar sesión. El acceso a las tablas se aplica mediante permisos de base de datos, incluso si alguien modifica el código del navegador.
