// UNTESTED EXAMPLE – not run on real hardware. Adapt pins/libraries to your sensor.
// Sends one reading per hour to the Smart Meter API. Replace readPowerKw() with a real
// sensor driver (e.g. PZEM-004T v3 over UART, or SCT-013 + ZMPT101B with EmonLib).
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* API_URL   = "https://YOUR-APP.vercel.app/api/readings";
const char* API_KEY   = "SAME_VALUE_AS_INGEST_API_KEY";
const char* METER_ID  = "SM-HOME-001";

float readPowerKw() {
  // TODO: replace with real measurement (average kW over the last interval).
  return 0.0;
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  configTime(0, 0, "pool.ntp.org");            // timestamps must be UTC
}

void loop() {
  struct tm t;
  if (getLocalTime(&t)) {
    char ts[25];
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:00:00Z", &t);   // hour-aligned UTC
    String body = String("{\"meterId\":\"") + METER_ID + "\",\"readings\":[{\"ts\":\"" + ts +
                  "\",\"powerKw\":" + String(readPowerKw(), 3) + "}]}";
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", API_KEY);
    int code = http.POST(body);
    Serial.printf("POST -> %d\n", code);
    http.end();
  }
  delay(3600UL * 1000UL);                      // one reading per hour
}
