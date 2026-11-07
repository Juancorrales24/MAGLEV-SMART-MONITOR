/* MAGLEV SMART MONITOR - firmware del ESP32.
 *
 * El prototipo ya NO levita: el tren va sobre ruedas y se detecta con tres sensores
 * infrarrojos, uno por estacion. Este firmware:
 *   - lee las tres entradas IR, filtra rebotes y emite UN evento por transicion
 *     (train_status: station_number 1-3 + detected true/false);
 *   - mide el panel solar y la bateria por ADC local (divisor resistivo) y envia
 *     solar_station con panel_voltage, battery_voltage y battery_level;
 *   - acepta ademas lineas JSON por Serial para bloques que no mide el ESP32
 *     (p. ej. measurements), con el formato de documentation/Integracion_ESP32.md;
 *   - encola los mensajes en RAM (FIFO acotada) y los entrega por HTTPS a
 *     POST /api/ingest respetando el limite de 1 mensaje nuevo por segundo;
 *   - muestra cada deteccion en una LCD 1602 I2C, funcione o no la red.
 *
 * No simula mediciones: solo reporta lo que lee de sus pines o recibe por Serial.
 * Core Arduino ESP32 2.x/3.x + ArduinoJson 7. Toda la configuracion fisica esta en
 * config.h (copiado de config.h.example) y esta PENDIENTE DE CONFIRMAR con el
 * circuito real: pines IR, nivel activo, direccion I2C y pines SDA/SCL.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <time.h>
#include "config.h"

// Un config.h copiado de una version anterior del ejemplo no tiene las constantes
// de los sensores IR, la cola ni la LCD: mejor un error claro que decenas confusas.
#if !defined(IR_PIN_ESTACION_1) || !defined(COLA_RANURAS) || !defined(LCD_ENABLED)
#error "config.h esta desactualizado: vuelve a copiarlo de config.h.example y rellena tus datos."
#endif

#if LCD_ENABLED
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#endif

// El handshake TLS de mbedTLS gasta varios KiB de pila y la cola y la LCD anaden
// algo mas: los 8 KiB por defecto de la tarea de loop() quedan justos. El #ifdef
// mantiene la compatibilidad con cores que no definan la macro.
#ifdef SET_LOOP_TASK_STACK_SIZE
SET_LOOP_TASK_STACK_SIZE(12 * 1024);
#endif

// Momento minimo aceptable para dar por valida la hora de red (2025-01-01).
// Sin hora valida no se puede comprobar la vigencia del certificado TLS.
const time_t HORA_MINIMA_VALIDA = 1735689600;

String inputLine;
bool descartandoLinea = false;
unsigned long ultimoEnvio = 0, ultimoWifi = 0, ultimaMuestraSolar = 0;
unsigned long reintentoMs = INTERVALO_MIN_ENVIO_MS;

// Ultimas lecturas solares, para la LCD. solarValido evita mostrar ceros inventados.
float ultimoPanel = 0.0f, ultimaBateria = 0.0f;
int ultimoPorcentaje = 0;
bool solarValido = false;

// ---------------------------------------------------------------------------
// Cola FIFO de mensajes pendientes
// ---------------------------------------------------------------------------
// Antes solo cabia un mensaje pendiente: una segunda deteccion llegada mientras se
// enviaba la primera se perdia. Ahora hay COLA_RANURAS ranuras de tamano fijo en RAM
// estatica (sin malloc, para no fragmentar el heap que necesita el handshake TLS).
// Dimensionado: COLA_RANURAS=16 x COLA_BYTES_POR_RANURA=384 B ~= 6,2 KiB estaticos.
// Un ESP32 tiene 320 KiB de DRAM y deja ~150-200 KiB de heap libre con WiFi+TLS
// activos, asi que 6 KiB es despreciable; a 1 mensaje/s la cola cubre ~16 s de
// atasco de red, suficiente para una reconexion WiFi tipica. Subirla cuesta RAM
// lineal: comprobar con ESP.getFreeHeap() antes de pasar de ~64 ranuras.
enum ClaseMensaje : uint8_t { CLASE_TREN = 0, CLASE_SOLAR = 1, CLASE_SERIAL = 2 };
struct Ranura { char json[COLA_BYTES_POR_RANURA]; uint8_t clase; };
Ranura cola[COLA_RANURAS];
uint16_t colaInicio = 0, colaUsadas = 0;
unsigned long colaDescartados = 0, colaSolarOmitidas = 0;
bool avisoSolarEmitido = false;

uint16_t colaSolaresEnEspera() {
  uint16_t n = 0;
  for (uint16_t i = 0; i < colaUsadas; i++)
    if (cola[(colaInicio + i) % COLA_RANURAS].clase == CLASE_SOLAR) n++;
  return n;
}

void colaQuitarFrente() {
  if (!colaUsadas) return;
  colaInicio = (colaInicio + 1) % COLA_RANURAS;
  colaUsadas--;
}

void aplicarBackoff() {
  unsigned long siguiente = reintentoMs * 2;
  if (siguiente > REINTENTO_MAX_MS || siguiente < reintentoMs) siguiente = REINTENTO_MAX_MS;
  reintentoMs = siguiente;
}

// Encola una copia del JSON ya serializado. Devuelve false e informa SIEMPRE por
// Serial cuando descarta algo: nunca se pierde un mensaje en silencio.
bool colaEmpujar(const char* json, uint8_t clase) {
  const size_t len = strlen(json);
  if (len + 1 > COLA_BYTES_POR_RANURA) {
    Serial.printf("COLA: mensaje de %u B descartado, la ranura es de %u B.\n",
                  (unsigned)len, (unsigned)COLA_BYTES_POR_RANURA);
    return false;
  }
  // Las muestras solares son periodicas y la siguiente sustituye a la anterior:
  // se limita su acumulacion para que un corte de red no llene la cola y deje
  // sin sitio a los eventos de tren, que son irrepetibles.
  if (clase == CLASE_SOLAR && colaSolaresEnEspera() >= COLA_MAX_SOLAR_EN_ESPERA) {
    colaSolarOmitidas++;
    if (!avisoSolarEmitido) {
      avisoSolarEmitido = true;
      Serial.printf("COLA: ya hay %u muestras solares en espera; se omiten las nuevas "
                    "hasta vaciar (omitidas en total: %lu).\n",
                    (unsigned)COLA_MAX_SOLAR_EN_ESPERA, colaSolarOmitidas);
    }
    return false;
  }
  if (colaUsadas >= COLA_RANURAS) {
    // Se prefiere perder lo mas antiguo antes que rechazar una deteccion nueva.
    // Riesgo real: puede desaparecer una llegada y sobrevivir su salida, de modo
    // que el panel vera un detected:false sin su detected:true.
    colaDescartados++;
    Serial.printf("COLA LLENA (%u): se descarta el mensaje mas antiguo para no perder el "
                  "nuevo. Descartados en total: %lu. Descartado -> %s\n",
                  (unsigned)COLA_RANURAS, colaDescartados, cola[colaInicio].json);
    colaQuitarFrente();
    reintentoMs = INTERVALO_MIN_ENVIO_MS; // el frente cambio: no arrastrar su backoff
  }
  const uint16_t destino = (colaInicio + colaUsadas) % COLA_RANURAS;
  memcpy(cola[destino].json, json, len + 1);
  cola[destino].clase = clase;
  colaUsadas++;
  if (clase == CLASE_SOLAR) avisoSolarEmitido = false;
  return true;
}

// ---------------------------------------------------------------------------
// Identificador de muestra y limpieza del JSON
// ---------------------------------------------------------------------------
String newSampleId() {
  uint8_t b[16]; esp_fill_random(b, sizeof(b));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  char id[37];
  snprintf(id, sizeof(id), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(id);
}

// null significa "desconocido" (Modelo_Datos.md) y ArduinoJson serializa NaN como null.
// La API rechaza bloques null o sin numeros y descartaria tambien las lecturas validas del mensaje.
void dropNullMembers(JsonObject obj) {
  for (bool removed = true; removed;) {
    removed = false;
    for (JsonObject::iterator it = obj.begin(); it != obj.end(); ++it)
      if (it->value().isNull()) { obj.remove(it); removed = true; break; }
  }
}

// Asigna el sample_id definitivo, serializa y encola. El sample_id se fija AQUI y
// viaja dentro de la ranura, asi que todos los reintentos reenvian el mismo:
// la API responde 201 la primera vez y 200 (duplicada) si ya lo tenia.
bool encolarDocumento(JsonDocument& doc, uint8_t clase) {
  doc["sample_id"] = newSampleId();
  const size_t necesarios = measureJson(doc);
  if (necesarios + 1 > COLA_BYTES_POR_RANURA) {
    Serial.printf("ERROR: el mensaje ocupa %u B y no cabe en una ranura de %u B.\n",
                  (unsigned)necesarios, (unsigned)COLA_BYTES_POR_RANURA);
    return false;
  }
  char buf[COLA_BYTES_POR_RANURA];
  serializeJson(doc, buf, sizeof(buf));
  return colaEmpujar(buf, clase);
}

// ---------------------------------------------------------------------------
// LCD 1602 por I2C
// ---------------------------------------------------------------------------
// Biblioteca: "LiquidCrystal I2C" de Frank de Brabander (ver esp32/README.md).
// Si no esta instalada, poner LCD_ENABLED en 0 en config.h: el resto del firmware
// compila y funciona igual, solo se queda sin pantalla.
#if LCD_ENABLED
LiquidCrystal_I2C lcd(LCD_DIRECCION_I2C, 16, 2);
bool lcdPresente = false;
char lcdLineas[2][17] = {"", ""};
char lcdEventoL1[17] = "", lcdEventoL2[17] = "";
bool lcdEventoPendiente = false, lcdMostrandoEvento = false, lcdEstadoAlterno = false;
unsigned long lcdEventoDesde = 0, lcdUltimoRefresco = 0;
#endif

// Escribe solo las lineas que cambian: sin lcd.clear() no hay parpadeo.
void lcdEscribir(const char* l1, const char* l2) {
#if LCD_ENABLED
  if (!lcdPresente) return;
  char b1[17], b2[17];
  snprintf(b1, sizeof(b1), "%-16.16s", l1);
  snprintf(b2, sizeof(b2), "%-16.16s", l2);
  if (strcmp(b1, lcdLineas[0]) != 0) { lcd.setCursor(0, 0); lcd.print(b1); strcpy(lcdLineas[0], b1); }
  if (strcmp(b2, lcdLineas[1]) != 0) { lcd.setCursor(0, 1); lcd.print(b2); strcpy(lcdLineas[1], b2); }
#else
  (void)l1; (void)l2;
#endif
}

// Se llama desde la deteccion local, antes de encolar nada: la pantalla muestra el
// evento aunque no haya WiFi o la API devuelva error.
void mostrarEventoLcd(uint8_t estacion, bool presencia) {
#if LCD_ENABLED
  snprintf(lcdEventoL1, sizeof(lcdEventoL1), "%s", presencia ? "TREN DETECTADO" : "TREN SALIO");
  snprintf(lcdEventoL2, sizeof(lcdEventoL2), "ESTACION %u", (unsigned)estacion);
  // Solo se guarda el evento mas reciente: si llegan dos en menos de
  // LCD_MS_MINIMO_EVENTO, el intermedio no se pinta (si queda en el log Serial).
  lcdEventoPendiente = true;
#else
  (void)estacion; (void)presencia;
#endif
}

void atenderLcd(unsigned long ahora) {
#if LCD_ENABLED
  if (!lcdPresente) return;
  // Un evento nuevo espera a que el anterior haya estado LCD_MS_MINIMO_EVENTO en
  // pantalla, para que se pueda leer.
  if (lcdEventoPendiente &&
      (!lcdMostrandoEvento || (unsigned long)(ahora - lcdEventoDesde) >= LCD_MS_MINIMO_EVENTO)) {
    lcdEscribir(lcdEventoL1, lcdEventoL2);
    lcdEventoPendiente = false; lcdMostrandoEvento = true; lcdEventoDesde = ahora;
    return;
  }
  if (lcdMostrandoEvento) {
    if ((unsigned long)(ahora - lcdEventoDesde) < LCD_MS_RETENER_EVENTO) return;
    lcdMostrandoEvento = false;
  }
  if ((unsigned long)(ahora - lcdUltimoRefresco) < LCD_MS_REFRESCO_ESTADO) return;
  lcdUltimoRefresco = ahora;
  lcdEstadoAlterno = !lcdEstadoAlterno;
  char l1[17], l2[17];
  // colaUsadas nunca pasa de COLA_RANURAS, pero se acota a dos digitos para que la
  // linea quepa siempre en las 16 columnas sin que snprintf tenga que truncarla.
  snprintf(l1, sizeof(l1), "WiFi:%-2s Cola:%u",
           WiFi.status() == WL_CONNECTED ? "OK" : "NO",
           (unsigned)(colaUsadas > 99 ? 99 : colaUsadas));
  // La segunda linea alterna bateria y panel cada LCD_MS_REFRESCO_ESTADO: el cambio
  // es lo bastante lento para leerse y lcdEscribir() solo reescribe lo que cambia.
  if (!solarValido) snprintf(l2, sizeof(l2), "Leyendo ADC...");
  else if (lcdEstadoAlterno) snprintf(l2, sizeof(l2), "Bat %.2fV %3d%%", ultimaBateria, ultimoPorcentaje);
  else snprintf(l2, sizeof(l2), "Panel %.2f V", ultimoPanel);
  lcdEscribir(l1, l2);
#else
  (void)ahora;
#endif
}

void iniciarLcd() {
#if LCD_ENABLED
  // setPins antes de begin(): LiquidCrystal_I2C llama internamente a Wire.begin()
  // sin pines, y begin() sin argumentos reutiliza los pines ya fijados aqui.
  Wire.setPins(LCD_PIN_SDA, LCD_PIN_SCL);
  Wire.begin();
  Wire.beginTransmission(LCD_DIRECCION_I2C);
  lcdPresente = (Wire.endTransmission() == 0);
  if (!lcdPresente) {
    // No se puede afirmar cual es la direccion sin probar el modulo: lo habitual es
    // 0x27 o 0x3F. Se listan las direcciones que responden para ajustar config.h.
    Serial.printf("LCD: nadie responde en 0x%02X (SDA=%d, SCL=%d). Direcciones I2C halladas:",
                  (unsigned)LCD_DIRECCION_I2C, (int)LCD_PIN_SDA, (int)LCD_PIN_SCL);
    uint8_t halladas = 0;
    for (uint8_t a = 0x08; a < 0x78; a++) {
      Wire.beginTransmission(a);
      if (Wire.endTransmission() == 0) { Serial.printf(" 0x%02X", a); halladas++; }
    }
    Serial.println(halladas ? " -> ajusta LCD_DIRECCION_I2C en config.h."
                            : " ninguna -> revisa cableado SDA/SCL, GND y alimentacion.");
    return;
  }
  lcd.init(); lcd.backlight(); lcd.clear();
  lcdLineas[0][0] = '\0'; lcdLineas[1][0] = '\0'; // la pantalla esta en blanco: invalidar cache
  lcdEscribir("MAGLEV MONITOR", "Iniciando...");
  Serial.printf("LCD 1602 I2C inicializada en 0x%02X.\n", (unsigned)LCD_DIRECCION_I2C);
#endif
}

// ---------------------------------------------------------------------------
// Sensores infrarrojos: uno por estacion
// ---------------------------------------------------------------------------
// El contrato acepta station_number 1, 2 o 3; el indice i del array corresponde a
// la estacion i+1, en el mismo orden que los pines de config.h.
const uint8_t IR_ESTACIONES = 3;
const int IR_PINS[IR_ESTACIONES] = { IR_PIN_ESTACION_1, IR_PIN_ESTACION_2, IR_PIN_ESTACION_3 };

// La ISR solo deja constancia del ultimo flanco: nivel, instante y numero de flancos.
// Sirve para recuperar el instante REAL de una transicion ocurrida mientras loop()
// estaba bloqueado dentro de un POST (HTTPClient es bloqueante).
portMUX_TYPE irMux = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t irFlancoMs[IR_ESTACIONES];
volatile uint8_t irFlancoNivel[IR_ESTACIONES];
volatile uint16_t irFlancoCuenta[IR_ESTACIONES];

uint16_t irCuentaVista[IR_ESTACIONES];
bool irCrudo[IR_ESTACIONES];              // ultimo nivel logico leido (true = presencia)
unsigned long irCrudoDesde[IR_ESTACIONES]; // instante monotonico en que aparecio ese nivel
bool irEstable[IR_ESTACIONES];            // estado ya confirmado y notificado
// Instantes monotonicos (millis()) de las transiciones, para un calculo FUTURO de
// rapidez media entre estaciones. Aqui no se calcula ni se envia ninguna velocidad.
unsigned long irUltimaTransicionMs[IR_ESTACIONES];
unsigned long irUltimaLlegadaMs[IR_ESTACIONES];
bool irHuboLlegada[IR_ESTACIONES];
unsigned long irUltimoAvisoMs[IR_ESTACIONES];
int llegadaPreviaEstacion = -1;
unsigned long llegadaPreviaMs = 0;

// Cuanto se confia en el instante guardado por la ISR. Con nuevos > 0 el flanco es
// posterior a la vuelta anterior de loop(), asi que este tope solo descarta valores
// absurdos (p. ej. un latch sin inicializar).
const unsigned long IR_LATCH_MAX_ANTIGUEDAD_MS = 30000;
// Tope de avisos de flancos perdidos, por estacion: los rebotes del comparador
// generan muchos flancos en microsegundos y llenarian el Serial.
const unsigned long IR_MS_ENTRE_AVISOS = 1000;

inline bool nivelEsPresencia(uint8_t estacion, int nivel) {
  // Muchos modulos IR entregan LOW al detectar; otros, HIGH. Se parametriza por
  // estacion en config.h (IR_ACTIVO_EN_BAJO) y esta PENDIENTE DE CONFIRMAR.
  return IR_ACTIVO_EN_BAJO[estacion] ? (nivel == LOW) : (nivel == HIGH);
}

void IRAM_ATTR irFlancoIsr(void* arg) {
  const uint32_t i = (uint32_t)(intptr_t)arg;
  const uint32_t t = millis();
  const uint8_t nivel = (uint8_t)digitalRead(IR_PINS[i]);
  portENTER_CRITICAL_ISR(&irMux);
  irFlancoMs[i] = t; irFlancoNivel[i] = nivel; irFlancoCuenta[i]++;
  portEXIT_CRITICAL_ISR(&irMux);
}

void registrarTransicion(uint8_t i, bool presencia, unsigned long instanteMs) {
  Serial.printf("IR: estacion %u %s (t=%lu ms desde el arranque).\n",
                (unsigned)(i + 1), presencia ? "TREN DETECTADO" : "TREN SALIO", instanteMs);
  // Registro local de intervalos. Todas las restas son entre unsigned long, asi que
  // siguen siendo correctas cuando millis() desborda (cada ~49,7 dias).
  // Esto es solo la MATERIA PRIMA de un calculo futuro de rapidez media: aqui no se
  // calcula ninguna velocidad y nada de esto se envia a la API.
  if (presencia) {
    if (irHuboLlegada[i])
      Serial.printf("IR: estacion %u, %lu ms desde su llegada anterior (registro local).\n",
                    (unsigned)(i + 1), (unsigned long)(instanteMs - irUltimaLlegadaMs[i]));
    if (llegadaPreviaEstacion >= 0 && llegadaPreviaEstacion != (int)i)
      Serial.printf("IR: %lu ms desde la llegada a la estacion %d (registro local).\n",
                    (unsigned long)(instanteMs - llegadaPreviaMs), llegadaPreviaEstacion + 1);
    irUltimaLlegadaMs[i] = instanteMs; irHuboLlegada[i] = true;
    llegadaPreviaEstacion = (int)i; llegadaPreviaMs = instanteMs;
  }
  irUltimaTransicionMs[i] = instanteMs;
  // La pantalla se actualiza antes de encolar: muestra el evento haya red o no.
  mostrarEventoLcd(i + 1, presencia);
  // train_status es estricto: exactamente station_number (entero 1-3) y detected.
  // No se envia sampled_at: el instante fiable que tiene el ESP32 es millis(), no una
  // fecha. Los eventos que salen de la cola tras un corte quedan sellados por el
  // servidor con la hora de recepcion, no con la de la deteccion (ver esp32/README.md).
  JsonDocument doc;
  JsonObject ts = doc["train_status"].to<JsonObject>();
  ts["station_number"] = (int)(i + 1);
  ts["detected"] = presencia;
  encolarDocumento(doc, CLASE_TREN);
}

// Maquina de estados por estacion: un evento por transicion confirmada y ninguno
// mientras el tren siga delante del mismo sensor.
void revisarSensoresIR(unsigned long ahora) {
  for (uint8_t i = 0; i < IR_ESTACIONES; i++) {
    uint32_t flancoMs; uint8_t flancoNivel; uint16_t cuenta;
    portENTER_CRITICAL(&irMux);
    flancoMs = irFlancoMs[i]; flancoNivel = irFlancoNivel[i]; cuenta = irFlancoCuenta[i];
    portEXIT_CRITICAL(&irMux);

    const bool presenciaAhora = nivelEsPresencia(i, digitalRead(IR_PINS[i]));
    unsigned long instante = ahora;
    const uint16_t nuevos = (uint16_t)(cuenta - irCuentaVista[i]); // resta modular: sobrevive al wrap
    if (nuevos > 0) {
      irCuentaVista[i] = cuenta;
      if (nivelEsPresencia(i, flancoNivel) == presenciaAhora &&
          (unsigned long)(ahora - flancoMs) <= IR_LATCH_MAX_ANTIGUEDAD_MS)
        instante = flancoMs; // el nivel actual viene de ese flanco: usar su instante real
      // La ISR solo guarda el ULTIMO flanco. Si entre dos vueltas hubo dos o mas
      // flancos y el nivel volvio al estado ya notificado, no se ha podido ver un
      // paso completo (llegada + salida): se avisa en vez de callarlo.
      if (nuevos >= 2 && presenciaAhora == irEstable[i] &&
          (unsigned long)(ahora - irUltimoAvisoMs[i]) >= IR_MS_ENTRE_AVISOS) {
        irUltimoAvisoMs[i] = ahora;
        Serial.printf("AVISO IR: %u flancos en estacion %u sin cambio neto de estado; "
                      "puede ser ruido del cableado o un paso completo no visto "
                      "(loop() bloqueado en un POST).\n",
                      (unsigned)nuevos, (unsigned)(i + 1));
      }
    }

    if (presenciaAhora != irCrudo[i]) { irCrudo[i] = presenciaAhora; irCrudoDesde[i] = instante; }
    // Antirrebote: el nivel debe mantenerse IR_ANTIRREBOTE_MS antes de darse por bueno.
    // Efecto colateral asumido: una presencia o ausencia mas corta que ese tiempo
    // no se notifica. Las restas se hacen siempre sobre unsigned long.
    if (presenciaAhora != irEstable[i] &&
        (unsigned long)(ahora - irCrudoDesde[i]) >= IR_ANTIRREBOTE_MS) {
      irEstable[i] = presenciaAhora;
      registrarTransicion(i, presenciaAhora, irCrudoDesde[i]);
    }
  }
}

void iniciarSensoresIR() {
  for (uint8_t i = 0; i < IR_ESTACIONES; i++) pinMode(IR_PINS[i], IR_MODO_ENTRADA);
  delay(IR_ANTIRREBOTE_MS * 2); // deja estabilizar las entradas tras el arranque
  const unsigned long ahora = millis();
  for (uint8_t i = 0; i < IR_ESTACIONES; i++) {
    const int nivel = digitalRead(IR_PINS[i]);
    const bool presencia = nivelEsPresencia(i, nivel);
    // El estado inicial NO genera evento: tras un reinicio o un corte de
    // alimentacion no se puede saber si hubo una transicion mientras estaba apagado,
    // y emitir una llegada falsa en cada arranque seria inventar una medicion.
    irCrudo[i] = presencia; irEstable[i] = presencia; irCrudoDesde[i] = ahora;
    irUltimaTransicionMs[i] = ahora; irUltimaLlegadaMs[i] = ahora; irHuboLlegada[i] = false;
    irUltimoAvisoMs[i] = 0;
    irFlancoMs[i] = ahora; irFlancoNivel[i] = (uint8_t)nivel;
    irFlancoCuenta[i] = 0; irCuentaVista[i] = 0;
    Serial.printf("IR estacion %u en GPIO %d (%s): estado inicial %s; no se notifica a la API.\n",
                  (unsigned)(i + 1), IR_PINS[i],
                  IR_ACTIVO_EN_BAJO[i] ? "activo en BAJO" : "activo en ALTO",
                  presencia ? "PRESENCIA" : "libre");
  }
  for (uint8_t i = 0; i < IR_ESTACIONES; i++)
    attachInterruptArg(digitalPinToInterrupt(IR_PINS[i]), irFlancoIsr, (void*)(intptr_t)i, CHANGE);
}

// ---------------------------------------------------------------------------
// Estacion solar: panel fotovoltaico y bateria de litio por ADC
// ---------------------------------------------------------------------------
const float FACTOR_DIVISOR = (DIVISOR_R1_OHM + DIVISOR_R2_OHM) / DIVISOR_R2_OHM;

float leerVoltaje(int pin, float calibracion) {
  uint32_t suma = 0;
  for (int i = 0; i < ADC_MUESTRAS; i++) {
    suma += analogReadMilliVolts(pin);
    delayMicroseconds(ADC_MICROS_ENTRE_MUESTRAS);
  }
  const float voltajeADC = (suma / (float)ADC_MUESTRAS) / 1000.0f;
  return voltajeADC * FACTOR_DIVISOR * calibracion;
}

// Curva aproximada de descarga de una celda Li-ion en reposo (solar_station.battery_level, 0-100%).
int porcentajeBateria(float v) {
  const float voltajes[] = {3.00, 3.30, 3.50, 3.60, 3.70, 3.75, 3.80, 3.85, 3.90, 4.00, 4.10, 4.20};
  const int porcentajes[] = {0, 5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 100};
  if (v <= voltajes[0]) return 0;
  if (v >= voltajes[11]) return 100;
  for (int i = 0; i < 11; i++) {
    if (v <= voltajes[i + 1]) {
      float f = (v - voltajes[i]) / (voltajes[i + 1] - voltajes[i]);
      return round(porcentajes[i] + f * (porcentajes[i + 1] - porcentajes[i]));
    }
  }
  return 0;
}

void sampleSolarStation() {
  const float panel = leerVoltaje(PIN_PANEL, CAL_PANEL);
  const float bateria = leerVoltaje(PIN_BATERIA, CAL_BATERIA);
  // Un NaN o un infinito (p. ej. DIVISOR_R2_OHM mal puesto a 0) falla cualquier
  // comparacion, asi que este rango los descarta sin depender de isfinite(), que no
  // esta garantizado en el espacio global de nombres. El tope de 10000 V es el que
  // acepta la API: enviar mas seria un 400 seguro.
  if (!(panel >= 0.0f && panel <= 10000.0f) || !(bateria >= 0.0f && bateria <= 10000.0f)) {
    Serial.printf("ERROR: lectura ADC fuera de rango (panel %.2f V, bateria %.2f V); "
                  "muestra solar descartada. Revisa DIVISOR_R1_OHM/DIVISOR_R2_OHM.\n",
                  panel, bateria);
    return;
  }
  const int porcentaje = porcentajeBateria(bateria);
  ultimoPanel = panel; ultimaBateria = bateria; ultimoPorcentaje = porcentaje; solarValido = true;
  Serial.printf("SOLAR: panel %.2f V, bateria %.2f V, nivel estimado %d %%.\n",
                panel, bateria, porcentaje);
  JsonDocument doc;
  JsonObject s = doc["solar_station"].to<JsonObject>();
  s["panel_voltage"] = panel;
  s["battery_voltage"] = bateria;
  // battery_level es una ESTIMACION a partir del voltaje en reposo, no una medida
  // directa de la carga: la curva Li-ion se desplaza con la corriente y la temperatura.
  s["battery_level"] = porcentaje;
  // panel_current y power_output se omiten a proposito: no hay sensor de corriente.
  encolarDocumento(doc, CLASE_SOLAR);
}

// ---------------------------------------------------------------------------
// Entrada JSON por Serial (bloques que no mide el ESP32, p. ej. measurements)
// ---------------------------------------------------------------------------
void acceptSensorLine(const String& line) {
  JsonDocument data;
  if (deserializeJson(data, line) || !data.is<JsonObject>()) {
    Serial.println("ERROR: JSON invalido del sensor."); return;
  }
  JsonObject root = data.as<JsonObject>();
  if (root["sampled_at"].isNull()) root.remove("sampled_at");
  bool hasBlock = false;
  for (const char* name : {"measurements", "train_status", "solar_station"}) {
    if (root[name].is<JsonObject>()) dropNullMembers(root[name].as<JsonObject>());
    if (root[name].isNull() || (root[name].is<JsonObject>() && root[name].size() == 0)) root.remove(name);
    else if (root[name].is<JsonObject>()) hasBlock = true;
  }
  if (!hasBlock) {
    Serial.println("ERROR: falta un bloque de mediciones reales."); return;
  }
  // No inventar sampled_at: omitirlo si el productor no conoce el instante de adquisicion.
  encolarDocumento(data, CLASE_SERIAL);
}

// Lee como maximo SERIAL_BYTES_POR_VUELTA bytes por vuelta: un productor rapido no
// debe retrasar el muestreo de los sensores IR.
void leerSerial() {
  size_t presupuesto = SERIAL_BYTES_POR_VUELTA;
  while (presupuesto > 0 && colaUsadas < COLA_RANURAS && Serial.available()) {
    presupuesto--;
    const char c = (char)Serial.read();
    if (c == '\n') {
      if (!descartandoLinea && inputLine.length()) acceptSensorLine(inputLine);
      inputLine = ""; descartandoLinea = false;
    } else if (c != '\r' && !descartandoLinea) {
      if (inputLine.length() >= SERIAL_MAX_LINEA) {
        inputLine = ""; descartandoLinea = true;
        Serial.printf("ERROR: linea de Serial mayor de %u bytes.\n", (unsigned)SERIAL_MAX_LINEA);
      } else inputLine += c;
    }
  }
}

// ---------------------------------------------------------------------------
// Envio HTTPS del frente de la cola
// ---------------------------------------------------------------------------
void enviarFrenteDeCola() {
  WiFiClientSecure tls;
  tls.setCACert(ROOT_CA); // verificacion TLS real: nunca setInsecure()
  tls.setHandshakeTimeout(TLS_HANDSHAKE_S); // segundos; el defecto (120 s) bloquea loop()
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(tls, API_URL)) {
    ultimoEnvio = millis(); aplicarBackoff();
    Serial.println("REINTENTO: no se pudo iniciar la conexion HTTPS.");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("X-Device-Id", DEVICE_ID);
  const int code = http.POST(String(cola[colaInicio].json));
  http.end();
  // El limite de 1 mensaje/s se mide desde que TERMINA el POST: mas conservador que
  // la ventana del servidor, que la mide entre mensajes aceptados.
  ultimoEnvio = millis();
  if (code == 201 || code == 200) {
    Serial.printf("OK %d: %s (quedan %u en cola).\n",
                  code, code == 200 ? "duplicada, ya estaba registrada" : "registrada",
                  (unsigned)(colaUsadas - 1));
    colaQuitarFrente(); reintentoMs = INTERVALO_MIN_ENVIO_MS;
  } else if (code == 429) {
    // Limite de ritmo: el mensaje sigue siendo valido. Se conserva su sample_id y se
    // reintenta con una espera fija; no hace falta backoff exponencial.
    Serial.println("429: el servidor pide esperar; se conserva el sample_id y se reintenta.");
    reintentoMs = INTERVALO_429_MS;
  } else if (code >= 400 && code < 500) {
    // 400 formato/rango, 401 credenciales, 403 dispositivo inactivo, 413 tamano,
    // 415 content-type: rechazos definitivos, reintentar no cambiaria el resultado.
    Serial.printf("ERROR HTTP %d: rechazo definitivo, mensaje descartado -> %s\n",
                  code, cola[colaInicio].json);
    colaQuitarFrente(); reintentoMs = INTERVALO_MIN_ENVIO_MS;
  } else {
    // 5xx o error de red (codigo negativo de HTTPClient): se conserva el sample_id,
    // asi que un reintento tras una respuesta perdida da 200 y no duplica el registro.
    Serial.printf("REINTENTO HTTP %d: se conserva el sample_id (%u en cola).\n",
                  code, (unsigned)colaUsadas);
    aplicarBackoff();
  }
  // Durante el POST loop() estuvo bloqueado. La ISR guardo el instante de los
  // flancos, asi que se atiende lo ocurrido en ese hueco en cuanto se vuelve.
  revisarSensoresIR(millis());
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  inputLine.reserve(SERIAL_MAX_LINEA + 1);
  if (!strlen(WIFI_SSID) || !strlen(DEVICE_ID) || !strlen(DEVICE_TOKEN) || strlen(ROOT_CA) < 100 || !String(API_URL).startsWith("https://")) {
    Serial.println("Completa config.h: WiFi, HTTPS, dispositivo, clave y certificado CA.");
    while (true) delay(1000);
  }
  iniciarLcd();
  iniciarSensoresIR();
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PANEL, ADC_11db);
  analogSetPinAttenuation(PIN_BATERIA, ADC_11db);
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const unsigned long ahora = millis();
  ultimoEnvio = ahora; ultimoWifi = ahora; ultimaMuestraSolar = ahora;
  Serial.printf("Listo: 3 sensores IR, panel solar y bateria por ADC, cola de %u mensajes "
                "(%u B por ranura). Tambien acepta lineas JSON por Serial.\n",
                (unsigned)COLA_RANURAS, (unsigned)COLA_BYTES_POR_RANURA);
}

void loop() {
  unsigned long ahora = millis();
  // Los sensores primero: es lo unico que no se puede recuperar si se pierde.
  revisarSensoresIR(ahora);
  atenderLcd(ahora);

  if (WiFi.status() != WL_CONNECTED && (unsigned long)(ahora - ultimoWifi) >= WIFI_REINTENTO_MS) {
    ultimoWifi = ahora; WiFi.reconnect();
  }

  leerSerial();

  if ((unsigned long)(ahora - ultimaMuestraSolar) >= SOLAR_INTERVALO_MS) {
    ultimaMuestraSolar = ahora;
    sampleSolarStation();
    ahora = millis();
    revisarSensoresIR(ahora); // el muestreo ADC tarda unos ms: atender los flancos ya
  }

  if (colaUsadas == 0 || WiFi.status() != WL_CONNECTED) { delay(1); return; }
  if ((unsigned long)(ahora - ultimoEnvio) < reintentoMs) { delay(1); return; }
  // TLS requiere hora valida para comprobar la vigencia del certificado.
  if (time(nullptr) < HORA_MINIMA_VALIDA) { delay(1); return; }
  enviarFrenteDeCola();
}
