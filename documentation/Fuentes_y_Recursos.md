# Fuentes técnicas y recursos

Documentación oficial consultada durante la elaboración:

- Next.js, instalación y App Router: https://nextjs.org/docs/app/getting-started/installation
- Supabase, cambios de PostgreSQL mediante Realtime: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, creación administrativa de usuarios: https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Espressif, WiFi en Arduino ESP32: https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html
- ArduinoJson 7, HTTPClient: https://arduinojson.org/v7/how-to/use-arduinojson-with-httpclient/

## Diseño y arte

El estilo visual se adapta a la referencia aportada por el usuario el 27 de septiembre de 2026. La interfaz se implementó como componentes HTML/React y CSS; no es una imagen de pantallas con botones inertes.

`frontend/public/maglev-station.png` es una ilustración conceptual generada con la herramienta integrada de imágenes, en un solo intento. Muestra un tren plateado de levitación y una estación fotovoltaica. No se afirma que sea una foto del prototipo ni una vista en directo.

Prompt utilizado: “Cinematic photorealistic 3D concept illustration of a silver futuristic magnetic-levitation passenger train with luminous cyan running lights, approaching in the left foreground, alongside an elegant modern station covered with photovoltaic solar panels on the right and in the background. Midnight navy and azure shadows, soft early dawn light, believable materials, wide landscape. No text, logos, watermark, interface, cards, charts, borders or collage. Reference montage used only for style.”

Los iconos se renderizan con Lucide. Las dependencias mantienen sus propias licencias en sus paquetes. Las versiones exactas se encuentran en `frontend/package.json` y `frontend/package-lock.json`.
