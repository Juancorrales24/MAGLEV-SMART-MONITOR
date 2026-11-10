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
 *     POST /api/ingest respetando el limite de mensajes nuevos de la API (INTERVALO_MIN_ENVIO_MS);
 *   - muestra cada deteccion en una LCD 1602 I2C, funcione o no la red.
 *
 * No simula mediciones: solo reporta lo que lee de sus pines o recibe por Serial.
 * Core Arduino ESP32 2.x/3.x + ArduinoJson 7. Toda la configuracion fisica esta en
 * config.h (copiado de config.h.example) y esta PENDIENTE DE CONFIRMAR con el
 * circuito real: pines IR, nivel activo, direccion I2C y pines SDA/SCL.
 */
#include <WiFi.h>
#include <WebServer.h>
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

// Valor por defecto para un config.h anterior a esta constante (ver config.h.example).
#ifndef IR_SALIDA_ESTABLE_MS
#define IR_SALIDA_ESTABLE_MS 250UL
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

// La web local funciona aun sin Internet. El envio a MAGLEV se habilita cuando
// WiFi, API y credenciales esten configurados en config.h.
WebServer localServer(80);
bool cloudConfigurada = false;
unsigned long eventosLocales = 0;
int ultimoHttpCodigo = 0;
unsigned long ultimoHttpCorrectoMs = 0;
String inputLine;
bool descartandoLinea = false;
unsigned long ultimoWifi = 0, ultimaMuestraSolar = 0;

// El envio HTTPS corre en su propia tarea de FreeRTOS, en el nucleo 0, para que un
// intento lento o fallido (hasta ~18 s entre handshake TLS y espera de respuesta)
// nunca bloquee loop() (nucleo 1): sensores IR, LCD y web local siguen atendidos
// en todo momento. colaMutex protege la cola, que ahora escriben AMBOS nucleos
// (loop() al encolar, la tarea de red al desencolar).
SemaphoreHandle_t colaMutex = nullptr;
TaskHandle_t tareaRedHandle = nullptr;
unsigned long ultimoEnvio = 0;
unsigned long reintentoMs = INTERVALO_MIN_ENVIO_MS;
// Conexion HTTPS PERSISTENTE (keep-alive). Antes se creaba un cliente TLS nuevo por
// mensaje y el handshake (~1 s en el ESP32) dominaba el envio: medido con el tren en
// marcha, ~1,6 s por mensaje, menos de lo que el tren genera, y la cola se llenaba.
// Ahora el handshake se paga una vez y la conexion se reutiliza. Ambos objetos deben
// vivir fuera de la funcion de envio: el destructor de HTTPClient cierra el socket.
// Solo los toca tareaRed (nucleo 0).
WiFiClientSecure tlsCliente;
HTTPClient httpCliente;
bool tlsConfigurado = false;
char ultimoTlsError[128] = "";

// Ultimas lecturas solares, para la LCD. solarValido evita mostrar ceros inventados.
float ultimoPanel = 0.0f, ultimaBateria = 0.0f;
int ultimoPorcentaje = 0;
bool solarValido = false;
// Muestra solar tomada con la cola ocupada: no gasta un envio propio, viaja dentro
// del siguiente evento de tren (la API admite ambos bloques en un mismo mensaje).
// Solo la usa loop() (nucleo 1).
bool solarPendiente = false;
float solarPendPanel = 0.0f, solarPendBateria = 0.0f;
int solarPendNivel = 0;

// ---------------------------------------------------------------------------
// Cola FIFO de mensajes pendientes
// ---------------------------------------------------------------------------
// Antes solo cabia un mensaje pendiente: una segunda deteccion llegada mientras se
// enviaba la primera se perdia. Ahora hay COLA_RANURAS ranuras de tamano fijo en RAM
// estatica (sin malloc, para no fragmentar el heap que necesita el handshake TLS).
// Dimensionado: COLA_RANURAS=16 x COLA_BYTES_POR_RANURA=384 B ~= 6,2 KiB estaticos.
// Un ESP32 tiene 320 KiB de DRAM y deja ~150-200 KiB de heap libre con WiFi+TLS
// activos, asi que 6 KiB es despreciable; a 1 mensaje/400 ms la cola cubre ~6,4 s de
// atasco de red, suficiente para una reconexion WiFi tipica. Subirla cuesta RAM
// lineal: comprobar con ESP.getFreeHeap() antes de pasar de ~64 ranuras.
enum ClaseMensaje : uint8_t { CLASE_TREN = 0, CLASE_SOLAR = 1, CLASE_SERIAL = 2 };
struct Ranura { char json[COLA_BYTES_POR_RANURA]; uint8_t clase; };
Ranura cola[COLA_RANURAS];
uint16_t colaInicio = 0, colaUsadas = 0;
unsigned long colaDescartados = 0;

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
// Se llama desde loop() (nucleo 1); toma colaMutex porque la tarea de red (nucleo 0)
// lee y modifica la misma cola al desencolar.
bool colaEmpujar(const char* json, uint8_t clase) {
  const size_t len = strlen(json);
  if (len + 1 > COLA_BYTES_POR_RANURA) {
    Serial.printf("COLA: mensaje de %u B descartado, la ranura es de %u B.\n",
                  (unsigned)len, (unsigned)COLA_BYTES_POR_RANURA);
    return false;
  }
  xSemaphoreTake(colaMutex, portMAX_DELAY);
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
  xSemaphoreGive(colaMutex);
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

void agregarBloqueSolar(JsonDocument& doc, float panel, float bateria, int nivel) {
  JsonObject s = doc["solar_station"].to<JsonObject>();
  s["panel_voltage"] = panel;
  s["battery_voltage"] = bateria;
  // battery_level es una ESTIMACION a partir del voltaje en reposo, no una medida
  // directa de la carga: la curva Li-ion se desplaza con la corriente y la temperatura.
  s["battery_level"] = nivel;
  // panel_current y power_output se omiten a proposito: no hay sensor de corriente.
}

// Asigna el sample_id definitivo, serializa y encola. El sample_id se fija AQUI y
// viaja dentro de la ranura, asi que todos los reintentos reenvian el mismo:
// la API responde 201 la primera vez y 200 (duplicada) si ya lo tenia.
bool encolarDocumento(JsonDocument& doc, uint8_t clase) {
  // Sin la configuracion remota no se llena una cola destinada a Internet.
  if (!cloudConfigurada) return false;
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
// Retencion LOCAL de la estacion, independiente de la latencia de Internet.
// Se prioriza estacion 1 > 2 > 3 como en el programa original.
const unsigned long RETENCION_ESTACION_MS = 5000UL;

// Nombres de las estaciones definidos en la web (Configuracion -> Estaciones de la via).
// Llegan dentro de la respuesta de cada envio aceptado (campo "stations"), asi que un
// renombrado en la pagina aparece aqui en el siguiente mensaje: con la muestra solar
// cada SOLAR_INTERVALO_MS, unos segundos como mucho. Vacio = aun no recibido o nombre
// sin caracteres representables: la LCD usa entonces "ESTACION N". Los escribe tareaRed
// (nucleo 0) al procesar respuestas y los lee loop() (nucleo 1) al pintar la LCD, por
// eso el mutex. Se pierden al reiniciar y se recuperan con el primer envio aceptado.
SemaphoreHandle_t nombresMutex = nullptr;
char nombresEstacion[3][17] = { "", "", "" };

// Copia un texto UTF-8 a lo que la LCD 1602 puede mostrar (ASCII imprimible, 16
// caracteres): las vocales acentuadas y la enie pierden la tilde (a con tilde -> a,
// enie -> n) porque el controlador HD44780 no las tiene en su tabla, y cualquier otro
// caracter no representable se omite. Devuelve false si no quedo ningun caracter util.
bool utf8ParaLcd(char* destino, size_t tam, const char* fuente) {
  size_t escrito = 0;
  for (const unsigned char* p = (const unsigned char*)fuente; *p && escrito + 1 < tam;) {
    unsigned char c = *p;
    if (c >= 0x20 && c <= 0x7E) { destino[escrito++] = (char)c; p++; continue; }
    if (c == 0xC3 && p[1]) {
      // Segunda unidad de la secuencia UTF-8 de dos bytes de los caracteres latinos.
      char plano = 0;
      switch (p[1]) {
        case 0xA1: plano = 'a'; break; case 0x81: plano = 'A'; break; // a/A con tilde
        case 0xA9: plano = 'e'; break; case 0x89: plano = 'E'; break;
        case 0xAD: plano = 'i'; break; case 0x8D: plano = 'I'; break;
        case 0xB3: plano = 'o'; break; case 0x93: plano = 'O'; break;
        case 0xBA: plano = 'u'; break; case 0x9A: plano = 'U'; break;
        case 0xBC: plano = 'u'; break; case 0x9C: plano = 'U'; break; // u con dieresis
        case 0xB1: plano = 'n'; break; case 0x91: plano = 'N'; break; // enie
        default: break;
      }
      if (plano) destino[escrito++] = plano;
      p += 2; continue;
    }
    // Resto de secuencias multibyte: saltar la secuencia completa sin escribir nada.
    p++;
    while ((*p & 0xC0) == 0x80) p++;
  }
  destino[escrito] = '\0';
  // Un nombre solo de espacios tampoco sirve como etiqueta: se devuelve vacio.
  for (size_t i = 0; i < escrito; i++) if (destino[i] != ' ') return true;
  destino[0] = '\0';
  return false;
}

// Nombre a mostrar para la estacion 1-3: el de la web si ya llego, o "ESTACION N".
void nombreParaLcd(uint8_t estacion, char* destino, size_t tam) {
  destino[0] = '\0';
  if (estacion >= 1 && estacion <= 3 && nombresMutex) {
    xSemaphoreTake(nombresMutex, portMAX_DELAY);
    snprintf(destino, tam, "%s", nombresEstacion[estacion - 1]);
    xSemaphoreGive(nombresMutex);
  }
  if (!destino[0]) snprintf(destino, tam, "ESTACION %u", (unsigned)estacion);
}
uint8_t estacionVisible = 0;
uint8_t ultimaEstacionVisible = 0;
bool estacionSensorActivo = false;
unsigned long instanteSalidaVisible = 0;

#if LCD_ENABLED
LiquidCrystal_I2C lcd(LCD_DIRECCION_I2C, 16, 2);
bool lcdPresente = false;
char lcdLineas[2][17] = {"", ""};
#endif

// Escribe solo si cambia el contenido. Evita parpadeos.
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

void atenderLcd(unsigned long ahora) {
  (void)ahora;
#if LCD_ENABLED
  if (!lcdPresente) return;
  char linea[17];
  if (estacionVisible) nombreParaLcd(estacionVisible, linea, sizeof(linea));
  else snprintf(linea, sizeof(linea), "SIN OBSTACULOS");
  lcdEscribir("SISTEMA ACTIVO", linea);
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
  // Sin esta pausa el resto de setup() (sensores, WiFi, servidor local) termina en
  // milisegundos y sobreescribe el mensaje casi de inmediato: no da tiempo a leerlo.
  delay(1500);
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
// estaba ocupado (lectura ADC, LCD, Serial). El POST ya no lo bloquea: va en tareaRed.
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
  if (presencia) eventosLocales++;
  // train_status es estricto: exactamente station_number (entero 1-3) y detected.
  // No se envia sampled_at: el instante fiable que tiene el ESP32 es millis(), no una
  // fecha. Los eventos que salen de la cola tras un corte quedan sellados por el
  // servidor con la hora de recepcion, no con la de la deteccion (ver esp32/README.md).
  JsonDocument doc;
  JsonObject ts = doc["train_status"].to<JsonObject>();
  ts["station_number"] = (int)(i + 1);
  ts["detected"] = presencia;
  if (solarPendiente) {
    // La ultima muestra solar aplazada viaja en este mismo mensaje: un envio menos.
    agregarBloqueSolar(doc, solarPendPanel, solarPendBateria, solarPendNivel);
    solarPendiente = false;
  }
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
                      "puede ser ruido del cableado o un pulso mas corto que una "
                      "vuelta de loop() (p. ej. ocupado escribiendo por Serial).\n",
                      (unsigned)nuevos, (unsigned)(i + 1));
      }
    }

    if (presenciaAhora != irCrudo[i]) { irCrudo[i] = presenciaAhora; irCrudoDesde[i] = instante; }
    // Antirrebote asimetrico. La LLEGADA se confirma tras IR_ANTIRREBOTE_MS; la SALIDA
    // exige IR_SALIDA_ESTABLE_MS sin presencia. Medido con el tren en marcha: la
    // estacion 2 veia el mismo paso como dos pulsos (72 ms, hueco de ~80 ms, 190 ms)
    // en TODAS las vueltas, es decir, dos llegadas por cada paso real. Con el filtro,
    // un hueco mas corto que IR_SALIDA_ESTABLE_MS no parte el paso en dos.
    // Efectos asumidos: una presencia mas corta que IR_ANTIRREBOTE_MS no se notifica,
    // la salida se notifica IR_SALIDA_ESTABLE_MS tarde (su instante registrado sigue
    // siendo el real) y dos pasos separados por menos de ese tiempo se verian como uno.
    const unsigned long estableMs = presenciaAhora ? IR_ANTIRREBOTE_MS : IR_SALIDA_ESTABLE_MS;
    if (presenciaAhora != irEstable[i] &&
        (unsigned long)(ahora - irCrudoDesde[i]) >= estableMs) {
      irEstable[i] = presenciaAhora;
      registrarTransicion(i, presenciaAhora, irCrudoDesde[i]);
    }
  }
}

// Los eventos enviados a Supabase siguen siendo llegadas/salidas reales de
// cada sensor. La prioridad 1 > 2 > 3 se aplica a lo que ve el usuario en LCD
// y web local, igual que en el codigo original.
void actualizarEstacionVisible(unsigned long ahora) {
  uint8_t prioritaria = 0;
  for (uint8_t i = 0; i < IR_ESTACIONES; i++) {
    if (irEstable[i]) { prioritaria = i + 1; break; }
  }
  if (prioritaria) {
    estacionVisible = prioritaria;
    ultimaEstacionVisible = prioritaria;
    estacionSensorActivo = true;
  } else if (estacionSensorActivo) {
    estacionSensorActivo = false;
    instanteSalidaVisible = ahora;
  } else if (estacionVisible &&
             (unsigned long)(ahora - instanteSalidaVisible) >= RETENCION_ESTACION_MS) {
    estacionVisible = 0;
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
  // Heap libre y mayor bloque contiguo en cada muestra (ritmo fijo, independiente
  // del exito/fallo del envio): sirve para ver si la memoria se va fragmentando con
  // el tiempo, lo que haria fallar el handshake TLS aunque el certificado este bien.
  Serial.printf("SOLAR: panel %.2f V, bateria %.2f V, nivel estimado %d %%. "
                "Heap libre %u B, mayor bloque %u B.\n",
                panel, bateria, porcentaje,
                (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
  // Con mensajes esperando, la muestra no se encola: los eventos de tren son
  // irrepetibles y la solar es periodica. Queda como "pendiente" y sale dentro del
  // siguiente evento de tren; si antes llega otra muestra, la sustituye. Con la cola
  // vacia (tren parado o red al dia) se envia sola, como siempre.
  xSemaphoreTake(colaMutex, portMAX_DELAY);
  const bool colaOcupada = colaUsadas > 0;
  xSemaphoreGive(colaMutex);
  if (colaOcupada) {
    solarPendPanel = panel; solarPendBateria = bateria; solarPendNivel = porcentaje;
    solarPendiente = true;
    return;
  }
  solarPendiente = false;
  JsonDocument doc;
  agregarBloqueSolar(doc, panel, bateria, porcentaje);
  encolarDocumento(doc, CLASE_SOLAR);
}

// ---------------------------------------------------------------------------
// Web local: no requiere acceso a Internet ni credenciales de Supabase.
// Abrir http://192.168.4.1 conectado a la red propia del ESP32.
// ---------------------------------------------------------------------------
const char HTML_LOCAL[] PROGMEM = R"MAGLEVWEB(
<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MAGLEV · Monitor local</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#14354d,#07101b 65%);color:#eaf4ff}
main{max-width:900px;margin:auto;padding:24px 16px 36px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
h1{font-size:clamp(19px,4vw,26px);margin:0}small,.sub{color:#9cb1c9}
.pill{border:1px solid #226c58;border-radius:999px;padding:8px 12px;background:#143a31;color:#80efc2;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
article{border:1px solid #294054;background:#162739;border-radius:20px;padding:21px}
.t{font-size:14px;color:#c5d8ec;font-weight:600}.value{font-size:clamp(29px,6vw,44px);font-weight:800;margin:16px 0}
.sun{color:#facc15}.bat{color:#4ade80}.full{grid-column:1/-1}
.bar{background:#33475a;border-radius:20px;height:13px;overflow:hidden}.fill{background:#4ade80;width:0;height:100%;transition:width .3s}
.stations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:18px}
.st{border:1px solid #3c5065;border-radius:14px;text-align:center;padding:17px 6px;background:#1c3043;transition:background .2s}
.st.on{border-color:#3ad5ff;background:#114962}.st.detect{border-color:#4ade80;background:#15503f}
.st strong{display:block;font-size:13px}.st .status{font-size:11px;color:#aebfd2;margin-top:7px}
.st.on .status{color:#8be6ff}.st.detect .status{color:#9df4b3}
.row{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #2a4054;padding:11px 0;font-size:13px}
.row span:first-child{color:#aabdd1}.row span:last-child{text-align:right}
footer{text-align:center;font-size:12px;color:#aabdd1;line-height:1.7;margin:22px 0}
@media(max-width:490px){article{padding:15px}.st{padding:13px 4px}.st strong{font-size:11px}}
</style></head><body><main>
<header><div><h1>🚆 MAGLEV SMART MONITOR</h1><div class="sub">Monitor local · ESP32</div></div>
<span id="conexion" class="pill">Conectando...</span></header>
<div class="grid">
<article><div class="t">☀ PANEL SOLAR</div><div id="panel" class="value sun">-- V</div><small>Voltaje del panel</small></article>
<article><div class="t">🔋 BATERÍA 18650</div><div id="bat" class="value bat">-- V</div>
<div class="bar"><div id="fill" class="fill"></div></div><small id="pct">Carga estimada: --%</small></article>
<article class="full"><div class="t">🚉 ESTACIONES · PRIORIDAD 1 → 2 → 3</div>
<div class="stations"><div class="st" id="e1"><strong>ESTACIÓN 1</strong><div class="status" id="s1">Libre</div></div>
<div class="st" id="e2"><strong>ESTACIÓN 2</strong><div class="status" id="s2">Libre</div></div>
<div class="st" id="e3"><strong>ESTACIÓN 3</strong><div class="status" id="s3">Libre</div></div></div>
<div class="row"><span>Estación mostrada</span><span id="actual">SIN OBSTÁCULOS</span></div>
<div class="row"><span>Última estación detectada</span><span id="ultima">NINGUNA</span></div>
<div class="row"><span>Tiempo restante en LCD</span><span id="resto">—</span></div>
<div class="row"><span>Detecciones desde encendido</span><span id="eventos">0</span></div></article>
<article class="full"><div class="t">📡 ESTADO DEL SISTEMA</div>
<div class="row"><span>WiFi del router</span><span id="wifi">—</span></div>
<div class="row"><span>Envío HTTPS a MAGLEV</span><span id="cloud">—</span></div>
<div class="row"><span>Última respuesta HTTP</span><span id="http">—</span></div>
<div class="row"><span>Mensajes pendientes</span><span id="cola">0</span></div></article>
</div><footer>Datos leídos del ESP32 · Actualización cada 0,5 s<br>
La retención del nombre no significa que el tren siga frente al sensor.</footer>
</main><script>
const el=id=>document.getElementById(id);let ocupado=false;
async function actualizar(){if(ocupado)return;ocupado=true;try{
const r=await fetch('/datos',{cache:'no-store'});if(!r.ok)throw Error('HTTP');const d=await r.json();
el('conexion').textContent='● Conectado al ESP32';
el('panel').textContent=d.panel===null?'-- V':d.panel.toFixed(2)+' V';
el('bat').textContent=d.bateria===null?'-- V':d.bateria.toFixed(2)+' V';
el('fill').style.width=d.porcentaje===null?'0%':d.porcentaje+'%';
el('pct').textContent='Carga estimada: '+(d.porcentaje===null?'--':d.porcentaje)+'%';
el('actual').textContent=d.estacion?'ESTACIÓN '+d.estacion:'SIN OBSTÁCULOS';
el('ultima').textContent=d.ultima?'ESTACIÓN '+d.ultima:'NINGUNA';
el('resto').textContent=d.detectando?'Sensor activo':d.restanteMs?(d.restanteMs/1000).toFixed(1)+' s':'—';
el('eventos').textContent=d.eventos;el('wifi').textContent=d.wifi?'Conectado':'Sin router';
el('cloud').textContent=d.cloud?'Configurado':'Pendiente';el('http').textContent=d.ultimoHttp===null?'Sin envíos':'HTTP '+d.ultimoHttp;el('cola').textContent=d.cola;
for(let i=1;i<=3;i++){const n=el('e'+i);n.className='st'+(d.estacion===i?(d.detectando?' detect':' on'):'');
el('s'+i).textContent=d.estacion===i?(d.detectando?'Detectando':'Retenido 5 s'):'Libre';}
}catch(e){el('conexion').textContent='● Sin comunicación con ESP32';}finally{ocupado=false;}}
actualizar();setInterval(actualizar,500);
</script></body></html>
)MAGLEVWEB";

void enviarDatosLocales() {
  unsigned long resto = 0;
  if (!estacionSensorActivo && estacionVisible) {
    const unsigned long tiempo = (unsigned long)(millis() - instanteSalidaVisible);
    if (tiempo < RETENCION_ESTACION_MS) resto = RETENCION_ESTACION_MS - tiempo;
  }
  JsonDocument doc;
  if (solarValido) {
    doc["panel"] = ultimoPanel;
    doc["bateria"] = ultimaBateria;
    doc["porcentaje"] = ultimoPorcentaje;
  } else {
    doc["panel"] = nullptr; doc["bateria"] = nullptr; doc["porcentaje"] = nullptr;
  }
  doc["estacion"] = estacionVisible;
  doc["ultima"] = ultimaEstacionVisible;
  doc["detectando"] = estacionSensorActivo;
  doc["restanteMs"] = resto;
  doc["eventos"] = eventosLocales;
  doc["wifi"] = (WiFi.status() == WL_CONNECTED);
  doc["cloud"] = cloudConfigurada;
  if (ultimoHttpCodigo) doc["ultimoHttp"] = ultimoHttpCodigo;
  else doc["ultimoHttp"] = nullptr;
  doc["cola"] = colaUsadas;
  String salida;
  serializeJson(doc, salida);
  localServer.sendHeader("Cache-Control", "no-store");
  localServer.send(200, "application/json", salida);
}

void iniciarServidorLocal() {
  localServer.on("/", HTTP_GET, []() {
    localServer.send_P(200, "text/html; charset=utf-8", HTML_LOCAL);
  });
  localServer.on("/datos", HTTP_GET, enviarDatosLocales);
  localServer.onNotFound([]() { localServer.send(404, "text/plain", "No encontrado"); });
  localServer.begin();
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
// Envio HTTPS del frente de la cola — corre en tareaRed (nucleo 0), nunca en loop().
// ---------------------------------------------------------------------------
// La respuesta de un envio aceptado trae los nombres de las estaciones puestos en la
// web. Se guardan para la LCD; una respuesta sin el campo "stations" (servidor
// anterior) o que no sea JSON se ignora sin tocar lo que ya habia.
void procesarRespuestaIngest(const String& cuerpo) {
  JsonDocument doc;
  if (deserializeJson(doc, cuerpo) != DeserializationError::Ok) return;
  JsonArray lista = doc["stations"].as<JsonArray>();
  if (lista.isNull()) return;
  for (JsonObject e : lista) {
    const int pos = e["position"] | 0;
    const char* nombre = e["name"] | "";
    if (pos < 1 || pos > 3) continue;
    char limpio[17];
    if (!utf8ParaLcd(limpio, sizeof(limpio), nombre)) limpio[0] = '\0';
    bool cambio = false;
    xSemaphoreTake(nombresMutex, portMAX_DELAY);
    if (strcmp(nombresEstacion[pos - 1], limpio) != 0) {
      cambio = true;
      snprintf(nombresEstacion[pos - 1], sizeof(nombresEstacion[pos - 1]), "%s", limpio);
    }
    xSemaphoreGive(nombresMutex);
    if (cambio)
      Serial.printf("LCD: la estacion %d se mostrara como \"%s\".\n",
                    pos, limpio[0] ? limpio : "ESTACION N (por defecto)");
  }
}

// Un POST sobre la conexion persistente. Devuelve el codigo HTTP (o el negativo de
// HTTPClient) e indica si iba sobre una conexion ya abierta. Ante un error de red
// cierra el socket, para que el siguiente intento empiece con un handshake limpio.
int postTelemetria(const char* mensaje, bool& reutilizada) {
  if (!tlsConfigurado) {
    tlsCliente.setCACert(ROOT_CA); // verificacion TLS real: nunca setInsecure()
    tlsCliente.setHandshakeTimeout(TLS_HANDSHAKE_S); // segundos
    httpCliente.setReuse(true);
    tlsConfigurado = true;
  }
  reutilizada = tlsCliente.connected();
  httpCliente.setConnectTimeout(HTTP_TIMEOUT_MS);
  httpCliente.setTimeout(HTTP_TIMEOUT_MS);
  if (!httpCliente.begin(tlsCliente, API_URL)) return 0;
  httpCliente.addHeader("Content-Type", "application/json");
  httpCliente.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  httpCliente.addHeader("X-Device-Id", DEVICE_ID);
  const int code = httpCliente.POST(String(mensaje));
  // Leer el cuerpo deja la conexion limpia para el siguiente mensaje; el de un envio
  // aceptado ademas trae los nombres de las estaciones para la LCD.
  if (code == 200 || code == 201) procesarRespuestaIngest(httpCliente.getString());
  else if (code > 0) httpCliente.getString();
  httpCliente.end(); // con keep-alive no cierra el socket; solo limpia la peticion
  if (code < 0) {
    ultimoTlsError[0] = '\0';
    tlsCliente.lastError(ultimoTlsError, sizeof(ultimoTlsError));
    tlsCliente.stop();
  }
  return code;
}

void enviarFrenteDeCola() {
  // Copiar el mensaje del frente bajo mutex: el POST (y el handshake TLS cuando toca
  // abrir conexion) no necesitan tener la cola bloqueada, y loop() sigue pudiendo
  // encolar mientras tanto.
  char mensaje[COLA_BYTES_POR_RANURA];
  xSemaphoreTake(colaMutex, portMAX_DELAY);
  snprintf(mensaje, sizeof(mensaje), "%s", cola[colaInicio].json);
  xSemaphoreGive(colaMutex);

  bool reutilizada = false;
  int code = postTelemetria(mensaje, reutilizada);
  if (code < 0 && reutilizada) {
    // El servidor o el router cerraron la conexion mientras estaba en reposo: es lo
    // normal en keep-alive y no indica un fallo de red. Se reintenta UNA vez, ya con
    // conexion nueva. Es seguro: el sample_id es el mismo, asi que si el primer
    // intento si llego, la API responde 200 (duplicada) y no registra dos veces.
    Serial.printf("RED: la conexion reutilizada se habia cerrado (%d, %s); se abre otra.\n",
                  code, httpCliente.errorToString(code).c_str());
    code = postTelemetria(mensaje, reutilizada);
  }
  ultimoHttpCodigo = code;
  if (code == 200 || code == 201) ultimoHttpCorrectoMs = millis();
  // El limite de INTERVALO_MIN_ENVIO_MS se mide desde que TERMINA el POST: mas conservador que
  // la ventana del servidor, que la mide entre mensajes aceptados.
  ultimoEnvio = millis();
  if (code == 201 || code == 200) {
    xSemaphoreTake(colaMutex, portMAX_DELAY);
    colaQuitarFrente();
    const unsigned enCola = colaUsadas;
    xSemaphoreGive(colaMutex);
    Serial.printf("OK %d: %s (quedan %u en cola). Heap libre %u B, mayor bloque %u B.\n",
                  code, code == 200 ? "duplicada, ya estaba registrada" : "registrada",
                  enCola, (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
    reintentoMs = INTERVALO_MIN_ENVIO_MS;
  } else if (code == 429) {
    // Limite de ritmo: el mensaje sigue siendo valido. Se conserva su sample_id y se
    // reintenta con una espera fija; no hace falta backoff exponencial.
    Serial.println("429: el servidor pide esperar; se conserva el sample_id y se reintenta.");
    reintentoMs = INTERVALO_429_MS;
  } else if (code >= 400 && code < 500) {
    // 400 formato/rango, 401 credenciales, 403 dispositivo inactivo, 413 tamano,
    // 415 content-type: rechazos definitivos, reintentar no cambiaria el resultado.
    Serial.printf("ERROR HTTP %d: rechazo definitivo, mensaje descartado -> %s\n", code, mensaje);
    xSemaphoreTake(colaMutex, portMAX_DELAY);
    colaQuitarFrente();
    xSemaphoreGive(colaMutex);
    reintentoMs = INTERVALO_MIN_ENVIO_MS;
  } else if (code == 0) {
    Serial.println("REINTENTO: no se pudo iniciar la conexion HTTPS.");
    aplicarBackoff();
  } else {
    // 5xx o error de red (codigo negativo de HTTPClient): se conserva el sample_id,
    // asi que un reintento tras una respuesta perdida da 200 y no duplica el registro.
    // Diagnostico: un codigo negativo no dice POR QUE fallo (DNS, TLS, red); se
    // imprime el texto de HTTPClient y, si hubo intento de TLS, el ultimo error de
    // mbedTLS para distinguir "no hay ruta a Internet" de "certificado rechazado".
    const char* tlsErr = code < 0 ? ultimoTlsError : "";
    Serial.printf("REINTENTO HTTP %d (%s)%s%s: se conserva el sample_id (%u en cola). "
                  "IP local %s, gateway %s, DNS %s, RSSI %d dBm. Heap libre %u B, mayor bloque %u B.\n",
                  code, httpCliente.errorToString(code).c_str(),
                  tlsErr[0] ? " | TLS: " : "", tlsErr,
                  (unsigned)colaUsadas,
                  WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(),
                  WiFi.dnsIP(0).toString().c_str(), (int)WiFi.RSSI(),
                  (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMaxAllocHeap());
    aplicarBackoff();
  }
}

// ---------------------------------------------------------------------------
// Tarea de red (nucleo 0): revisa la cola y envia sin bloquear loop() (nucleo 1).
// ---------------------------------------------------------------------------
void tareaRed(void* parametro) {
  (void)parametro;
  for (;;) {
    const unsigned long ahora = millis();
    bool debeEnviar = false;
    if (cloudConfigurada && WiFi.status() == WL_CONNECTED &&
        (unsigned long)(ahora - ultimoEnvio) >= reintentoMs &&
        time(nullptr) >= HORA_MINIMA_VALIDA) {
      xSemaphoreTake(colaMutex, portMAX_DELAY);
      debeEnviar = colaUsadas > 0;
      xSemaphoreGive(colaMutex);
    }
    if (debeEnviar) enviarFrenteDeCola();
    else vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  inputLine.reserve(SERIAL_MAX_LINEA + 1);
  colaMutex = xSemaphoreCreateMutex();
  nombresMutex = xSemaphoreCreateMutex();

  // Se permite el modo local sin credenciales de Internet.
  cloudConfigurada = strlen(WIFI_SSID) > 0 && strlen(DEVICE_ID) > 0 &&
    strlen(DEVICE_TOKEN) > 0 && strlen(ROOT_CA) > 100 &&
    String(API_URL).startsWith("https://");

  iniciarLcd();
  iniciarSensoresIR();
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_PANEL, ADC_11db);
  analogSetPinAttenuation(PIN_BATERIA, ADC_11db);

  // Se mantienen dos interfaces: AP local y STA para conectar al router.
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  // Baja la potencia de transmision (maximo de fabrica ~19,5 dBm) para reducir el
  // pico de corriente en cada transmision, que puede hundir el voltaje y reiniciar
  // el ESP32 (POWERON_RESET) con una fuente USB justa. 15 dBm deja margen de sobra
  // con la señal medida en pruebas (RSSI -44 a -48 dBm); si el ESP32 queda mas lejos
  // del router o pierde conexion, subir este valor.
  WiFi.setTxPower(WIFI_POWER_15dBm);
  if (WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.printf("RED MAGLEV LOCAL: %s | IP: %s\n",
                  AP_SSID, WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("AVISO: no se pudo iniciar el punto de acceso local.");
  }
  iniciarServidorLocal();

  if (strlen(WIFI_SSID) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.printf("Conectando al router: %s\n", WIFI_SSID);
  }
  if (!cloudConfigurada) {
    Serial.println("MODO LOCAL: completa API_URL, DEVICE_ID, DEVICE_TOKEN, ROOT_CA y WiFi para enviar a MAGLEV.");
  } else {
    Serial.println("Modo remoto listo para enviar datos a MAGLEV por HTTPS verificado.");
  }
  const unsigned long ahora = millis();
  ultimoEnvio = ahora; ultimoWifi = ahora; ultimaMuestraSolar = ahora;
  revisarSensoresIR(ahora);
  actualizarEstacionVisible(ahora);
  atenderLcd(ahora);
  // Nucleo 0: solo el envio HTTPS. Nucleo 1 (loop(), por defecto en el core Arduino
  // de ESP32) sigue libre para sensores, LCD y servidor local sin que un envio
  // lento lo bloquee. Pila generosa: ahi vive el handshake TLS, no en loop().
  xTaskCreatePinnedToCore(tareaRed, "tareaRed", 12288, nullptr, 1, &tareaRedHandle, 0);
  Serial.printf("ESP32 listo. Sensores GPIO 25/26/27, pantalla retenida %lu ms, cola de %u.\n",
                RETENCION_ESTACION_MS, (unsigned)COLA_RANURAS);
}

void loop() {
  unsigned long ahora = millis();
  // Priorizar los sensores incluso cuando no hay WiFi. El envio HTTPS vive en
  // tareaRed (nucleo 0): loop() nunca espera por la red.
  revisarSensoresIR(ahora);
  actualizarEstacionVisible(ahora);
  atenderLcd(ahora);
  localServer.handleClient();

  if (strlen(WIFI_SSID) > 0 && WiFi.status() != WL_CONNECTED &&
      (unsigned long)(ahora - ultimoWifi) >= WIFI_REINTENTO_MS) {
    ultimoWifi = ahora;
    WiFi.reconnect();
  }

  leerSerial();
  if ((unsigned long)(ahora - ultimaMuestraSolar) >= SOLAR_INTERVALO_MS) {
    ultimaMuestraSolar = ahora;
    sampleSolarStation();
    ahora = millis();
    revisarSensoresIR(ahora);
    actualizarEstacionVisible(ahora);
    atenderLcd(ahora);
  }
  delay(1);
}
