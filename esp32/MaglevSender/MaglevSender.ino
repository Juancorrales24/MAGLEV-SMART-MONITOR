/* MAGLEV: transporte de lecturas reales recibidas como JSON por Serial.
 * No genera ni simula mediciones. El código del sensor debe producir los bloques
 * definidos en documentation/Integracion_ESP32.md. Core Arduino ESP32 + ArduinoJson 7.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <time.h>
#include "config.h"

String inputLine, pendingPayload;
bool discarding = false;
unsigned long lastSend = 0, lastWifi = 0;
unsigned long retryMs = 2000;

String newSampleId() {
  uint8_t b[16]; esp_fill_random(b, sizeof(b));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  char id[37];
  snprintf(id, sizeof(id), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(id);
}

// null significa "desconocido" (Modelo_Datos.md) y ArduinoJson serializa NaN como null.
// La API rechaza bloques null o sin números y descartaría también las lecturas válidas del mensaje.
void dropNullMembers(JsonObject obj) {
  for (bool removed = true; removed;) {
    removed = false;
    for (JsonObject::iterator it = obj.begin(); it != obj.end(); ++it)
      if (it->value().isNull()) { obj.remove(it); removed = true; break; }
  }
}

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
  data["sample_id"] = newSampleId();
  // No inventar sampled_at: omitirlo si el productor no conoce el instante de adquisición.
  pendingPayload = ""; serializeJson(data, pendingPayload);
}

void setup() {
  Serial.begin(115200);
  inputLine.reserve(2048); pendingPayload.reserve(3072);
  if (!strlen(WIFI_SSID) || !strlen(DEVICE_ID) || !strlen(DEVICE_TOKEN) || strlen(ROOT_CA) < 100 || !String(API_URL).startsWith("https://")) {
    Serial.println("Completa config.h: WiFi, HTTPS, dispositivo, clave y certificado CA.");
    while (true) delay(1000);
  }
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.println("Esperando lecturas JSON reales por Serial, una por linea.");
}

void loop() {
  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED && now - lastWifi >= 10000) { lastWifi = now; WiFi.reconnect(); }
  // Un mensaje pendiente: aplicar control de flujo al productor. No garantiza cola durante apagones.
  while (Serial.available() && pendingPayload.isEmpty()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      if (!discarding && inputLine.length()) acceptSensorLine(inputLine);
      inputLine = ""; discarding = false;
    } else if (c != '\r' && !discarding) {
      if (inputLine.length() >= 2048) { inputLine = ""; discarding = true; Serial.println("ERROR: linea mayor de 2048 bytes."); }
      else inputLine += c;
    }
  }
  if (pendingPayload.isEmpty() || WiFi.status() != WL_CONNECTED || now - lastSend < retryMs) { delay(5); return; }
  // TLS requiere hora válida para comprobar la vigencia del certificado.
  if (time(nullptr) < 1735689600) { delay(5); return; }
  lastSend = now;
  WiFiClientSecure tls; tls.setCACert(ROOT_CA);  HTTPClient http; http.setTimeout(8000);
  if (!http.begin(tls, API_URL)) { retryMs = min(retryMs * 2, 60000UL); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("X-Device-Id", DEVICE_ID);
  int code = http.POST(pendingPayload);
  http.end();
  if (code == 200 || code == 201) {
    Serial.println("OK: lectura recibida."); pendingPayload = ""; retryMs = 2000;
  } else if (code >= 400 && code < 500 && code != 429) {
    Serial.printf("ERROR HTTP %d: revisar credenciales o formato. Lectura descartada.\n", code);
    pendingPayload = ""; retryMs = 2000;
  } else {
    Serial.printf("REINTENTO HTTP %d\n", code);
    retryMs = min(retryMs * 2, 60000UL); // conserva sample_id: no duplica la lectura aceptada.
  }
}
