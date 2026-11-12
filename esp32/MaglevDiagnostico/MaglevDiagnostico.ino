/* MAGLEV SMART MONITOR - Sketch de DIAGNOSTICO.
 *
 * No envia nada a Internet ni toca la base de datos: solo mide y escribe por
 * el Monitor Serie. Sirve para localizar, SIN MULTIMETRO, dos problemas:
 *
 *   1. Sensores infrarrojos que oscilan o se quedan pegados en "presencia".
 *   2. WiFi que no conecta (nombre mal escrito, red de 5 GHz o fuera de alcance).
 *
 * Como usarlo:
 *   - Abrir este sketch en Arduino IDE y pulsar Subir (no hace falta config.h).
 *   - Abrir el Monitor Serie a 115200 baudios.
 *   - Durante la PRUEBA 1 no poner nada delante de los sensores.
 *   - Al terminar, queda en modo continuo para menear cables o pasar la mano.
 *   - Despues, volver a subir el sketch normal (MaglevSender).
 *
 * No modifica nada del dispositivo de forma permanente.
 */
#include <WiFi.h>
#include <esp_system.h>

// ---------------------------------------------------------------------------
// AJUSTES - deben coincidir con los de config.h del sketch normal.
// ---------------------------------------------------------------------------
#define PIN_ESTACION_1 26
#define PIN_ESTACION_2 27
#define PIN_ESTACION_3 25

// true = el sensor entrega nivel BAJO cuando detecta (lo habitual en estos modulos).
const bool ACTIVO_EN_BAJO[3] = { true, true, true };

// Opcional: el nombre EXACTO de la red que deberia usar el sketch normal, copiado
// tal cual de config.h (WIFI_SSID), incluidos los espacios. Si se deja vacio, el
// diagnostico solo lista las redes visibles y no compara.
const char* SSID_A_BUSCAR = "";

// ---------------------------------------------------------------------------
const int PINES[3] = { PIN_ESTACION_1, PIN_ESTACION_2, PIN_ESTACION_3 };
const uint32_t DURACION_PRUEBA_MS = 3000;  // cuanto dura cada muestreo
const uint32_t PASO_TIRA_MS       = 100;   // cada cuanto se dibuja un caracter
const size_t   TIRA_MAX           = 40;    // caracteres de la tira visual

// Umbral de "oscila". Una vuelta completa del tren dura ~13 s y el paso por un
// sensor ~0,1 s, asi que en 3 s en reposo NO deberia haber ningun cambio.
const uint32_t CAMBIOS_INESTABLE = 4;

struct Muestra {
  uint32_t cambios;      // transiciones del pin durante la prueba
  uint32_t total;        // lecturas tomadas
  uint32_t enPresencia;  // lecturas con nivel de presencia
  char     tira[TIRA_MAX + 1];
};

inline bool esPresencia(uint8_t i, int nivel) {
  return ACTIVO_EN_BAJO[i] ? (nivel == LOW) : (nivel == HIGH);
}

// Muestrea los tres pines a la vez durante "duracionMs". Cuenta cada transicion
// (lectura rapida, ~1 ms) y ademas dibuja una tira legible con una marca cada
// PASO_TIRA_MS: '1' = libre, '0' = presencia.
void muestrear(Muestra m[3], uint32_t duracionMs) {
  bool ultimo[3];
  for (uint8_t i = 0; i < 3; i++) {
    ultimo[i] = esPresencia(i, digitalRead(PINES[i]));
    m[i].cambios = 0; m[i].total = 0; m[i].enPresencia = 0; m[i].tira[0] = '\0';
  }
  size_t idx = 0;
  const uint32_t t0 = millis();
  uint32_t siguienteMarca = t0;
  while ((uint32_t)(millis() - t0) < duracionMs) {
    for (uint8_t i = 0; i < 3; i++) {
      const bool presencia = esPresencia(i, digitalRead(PINES[i]));
      if (presencia != ultimo[i]) { m[i].cambios++; ultimo[i] = presencia; }
      m[i].total++;
      if (presencia) m[i].enPresencia++;
    }
    if (idx < TIRA_MAX && (uint32_t)(millis() - siguienteMarca) >= PASO_TIRA_MS) {
      for (uint8_t i = 0; i < 3; i++) m[i].tira[idx] = ultimo[i] ? '0' : '1';
      idx++;
      siguienteMarca += PASO_TIRA_MS;
    }
    delay(1);
  }
  for (uint8_t i = 0; i < 3; i++) m[i].tira[idx] = '\0';
}

// Veredicto en lenguaje llano. "enReposo" indica que no deberia haber nada
// delante del sensor, de modo que una presencia fija es sospechosa.
const char* veredicto(const Muestra& m, bool enReposo) {
  if (m.cambios >= CAMBIOS_INESTABLE)            return "INESTABLE: la senal oscila";
  if (m.total && m.enPresencia == m.total)
    return enReposo ? "PEGADO EN PRESENCIA sin nada delante" : "presencia continua";
  if (m.cambios > 0)                             return "casi estable (algun cambio suelto)";
  return "ESTABLE y libre: correcto";
}

void imprimirMuestras(Muestra m[3], bool enReposo) {
  for (uint8_t i = 0; i < 3; i++) {
    Serial.printf("  Estacion %u (GPIO %2d): %s\n", (unsigned)(i + 1), PINES[i], m[i].tira);
    Serial.printf("      %lu cambios en %lu ms, %lu%% del tiempo en presencia -> %s\n",
                  (unsigned long)m[i].cambios, (unsigned long)DURACION_PRUEBA_MS,
                  (unsigned long)(m[i].total ? (m[i].enPresencia * 100UL) / m[i].total : 0),
                  veredicto(m[i], enReposo));
  }
}

const char* textoReinicio() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "corte o conexion de alimentacion";
    case ESP_RST_BROWNOUT:  return "BAJADA DE VOLTAJE (brownout): la fuente no da abasto";
    case ESP_RST_SW:        return "reinicio por software (normal tras subir el sketch)";
    case ESP_RST_PANIC:     return "error del programa";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:       return "watchdog: el programa dejo de responder";
    case ESP_RST_EXT:       return "boton de reset";
    case ESP_RST_DEEPSLEEP: return "salida de suspension";
    default:                return "desconocido";
  }
}

// Compara ignorando mayusculas y espacios de los extremos, para detectar el caso
// tipico: el nombre es correcto pero sobra o falta un espacio.
String normalizar(const String& s) {
  String t = s; t.trim(); t.toLowerCase(); return t;
}

void listarRedes() {
  Serial.println();
  Serial.println("--- PRUEBA 2: redes WiFi que el ESP32 ve de verdad ---");
  Serial.println("El ESP32 solo ve redes de 2,4 GHz. Si tu red es de 5 GHz no saldra aqui.");
  Serial.println("Buscando (tarda unos segundos)...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(120);
  const int n = WiFi.scanNetworks();
  if (n <= 0) {
    Serial.println("  No se vio NINGUNA red. Revisa la antena, la distancia o si el ESP32");
    Serial.println("  esta dentro de algo metalico.");
    return;
  }
  Serial.printf("  %d redes visibles (entre corchetes para que se vean los espacios):\n", n);
  bool exacta = false, parecida = false;
  String candidata;
  for (int i = 0; i < n; i++) {
    const String s = WiFi.SSID(i);
    Serial.printf("  %2d. [%s]%*s %4d dBm  canal %2d  %s", i + 1, s.c_str(),
                  (int)(s.length() < 24 ? 24 - s.length() : 1), "",
                  (int)WiFi.RSSI(i), (int)WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "abierta" : "protegida");
    if (s.length() && (s[0] == ' ' || s[s.length() - 1] == ' '))
      Serial.print("   <-- OJO: empieza o termina en ESPACIO");
    Serial.println();
    if (strlen(SSID_A_BUSCAR) > 0) {
      if (s == String(SSID_A_BUSCAR)) exacta = true;
      else if (normalizar(s) == normalizar(String(SSID_A_BUSCAR))) { parecida = true; candidata = s; }
    }
  }
  if (strlen(SSID_A_BUSCAR) == 0) {
    Serial.println();
    Serial.println("  (No se comparo con ninguna red: SSID_A_BUSCAR esta vacio en este sketch.)");
    Serial.println("  Compara tu mismo el nombre de arriba con el WIFI_SSID de config.h.");
    return;
  }
  Serial.println();
  Serial.printf("  Buscando exactamente [%s]:\n", SSID_A_BUSCAR);
  if (exacta) {
    Serial.println("    ENCONTRADA tal cual. El nombre es correcto; si aun asi no conecta,");
    Serial.println("    sospecha de la contrasena o de la alimentacion.");
  } else if (parecida) {
    Serial.printf("    NO aparece tal cual, pero [%s] se le parece.\n", candidata.c_str());
    Serial.println("    Difieren en mayusculas o en espacios al principio o al final.");
    Serial.println("    Copia el nombre de la lista EXACTAMENTE en WIFI_SSID de config.h.");
  } else {
    Serial.println("    NO APARECE. Puede ser una red de 5 GHz, estar apagada o fuera de alcance.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1200);                       // da tiempo a abrir el Monitor Serie
  for (uint8_t i = 0; i < 3; i++) pinMode(PINES[i], INPUT_PULLUP);
  delay(200);                        // deja estabilizar las entradas

  Serial.println();
  Serial.println("================================================");
  Serial.println("   DIAGNOSTICO MAGLEV - no hace falta multimetro");
  Serial.println("================================================");
  Serial.printf("Motivo del ultimo arranque: %s\n", textoReinicio());
  Serial.printf("Memoria libre: %u B\n", (unsigned)ESP.getFreeHeap());

  Serial.println();
  Serial.println("--- PRUEBA 1: sensores en reposo, con la radio APAGADA ---");
  Serial.println("NO pongas nada delante de los sensores durante estos 3 segundos.");
  Serial.println("Tira: 1 = libre, 0 = presencia. Un sensor sano debe dar todo 1 y 0 cambios.");
  WiFi.mode(WIFI_OFF);
  delay(300);
  Muestra reposo[3];
  muestrear(reposo, DURACION_PRUEBA_MS);
  imprimirMuestras(reposo, true);

  listarRedes();

  Serial.println();
  Serial.println("--- PRUEBA 3: los mismos sensores con la RADIO TRABAJANDO ---");
  Serial.println("Se enciende el punto de acceso y se rastrea a potencia maxima: el peor caso");
  Serial.println("de consumo. Sigue sin poner nada delante de los sensores.");
  WiFi.mode(WIFI_AP_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.softAP("MAGLEV-DIAG", "Maglev2026");
  WiFi.scanNetworks(true);           // rastreo asincrono: la radio transmite mientras medimos
  delay(200);
  Muestra carga[3];
  muestrear(carga, DURACION_PRUEBA_MS);
  imprimirMuestras(carga, true);

  Serial.println();
  Serial.println("================= CONCLUSION =================");
  bool culpaDeLaCorriente = false, malSiempre = false;
  for (uint8_t i = 0; i < 3; i++) {
    const bool okReposo = reposo[i].cambios < CAMBIOS_INESTABLE &&
                          !(reposo[i].total && reposo[i].enPresencia == reposo[i].total);
    const bool okCarga  = carga[i].cambios < CAMBIOS_INESTABLE &&
                          !(carga[i].total && carga[i].enPresencia == carga[i].total);
    if (okReposo && !okCarga) culpaDeLaCorriente = true;
    if (!okReposo) malSiempre = true;
  }
  if (culpaDeLaCorriente) {
    Serial.println("Algun sensor estaba BIEN con la radio apagada y FALLA con la radio");
    Serial.println("trabajando. Es un problema de ALIMENTACION: la radio se lleva la");
    Serial.println("corriente que necesitan los sensores.");
    Serial.println("  -> Cable USB mas corto y grueso, cargador de 2 A, o alimentar los");
    Serial.println("     sensores desde una fuente aparte con la MASA unida a la del ESP32.");
  }
  if (malSiempre) {
    Serial.println("Algun sensor falla INCLUSO con la radio apagada. Eso no es consumo:");
    Serial.println("es cableado. Revisa sobre todo el GND comun de los modulos, y el");
    Serial.println("tornillito de ajuste de sensibilidad.");
  }
  if (!culpaDeLaCorriente && !malSiempre) {
    Serial.println("Los tres sensores se comportaron bien en las dos pruebas.");
    Serial.println("Si el tren sigue sin detectarse, el fallo aparece solo con el tren en");
    Serial.println("marcha: usa el modo continuo de abajo mientras das una vuelta.");
  }

  Serial.println();
  Serial.println("--- MODO CONTINUO ---");
  Serial.println("Una linea por segundo. Ahora SI puedes pasar la mano por delante de un");
  Serial.println("sensor, o menear los cables uno a uno para ver cual responde mal.");
  Serial.println("Entre parentesis, los cambios de ese segundo: en reposo deben ser 0.");
}

void loop() {
  Muestra m[3];
  muestrear(m, 1000);
  Serial.printf("E1:%s(%lu)  E2:%s(%lu)  E3:%s(%lu)\n",
                m[0].tira, (unsigned long)m[0].cambios,
                m[1].tira, (unsigned long)m[1].cambios,
                m[2].tira, (unsigned long)m[2].cambios);
}
