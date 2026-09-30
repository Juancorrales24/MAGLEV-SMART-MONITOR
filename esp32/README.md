# Emisor de lecturas

Abre `MaglevSender/MaglevSender.ino` con Arduino IDE, instala ArduinoJson 7 y copia `config.h.example` a `config.h`. Completa configuración real y CA de HTTPS.

El código transporta JSON de mediciones recibido por Serial. No contiene datos simulados ni drivers de sensores desconocidos. Consulta `documentation/Integracion_ESP32.md` para el contrato, reintentos y adaptación a los sensores del prototipo. La compilación de placa y prueba física deben realizarse con el modelo concreto de ESP32.
