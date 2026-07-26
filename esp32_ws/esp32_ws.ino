/**
 * esp32_ws.ino
 * ============================================================
 * OTA Mission Control — ESP32-S3 Nano Firmware
 * ============================================================
 * Connects to the FastAPI broker over WebSocket and acts as the
 * primary telemetry source and OTA flash dispatcher.
 *
 * Responsibilities:
 *   - Maintains a persistent, auto-reconnecting WebSocket to
 *     ws://<broker>:8000/ws/hardware?node_id=ESP32-S3
 *   - Streams a telemetry JSON frame every TELEMETRY_INTERVAL_MS
 *   - Listens for flash_command from the broker and forwards a
 *     two-step protocol to the RP2040 over UART1:
 *       1.  FLASH_PREP:<filename>\n   — RP2040 enters CONFIGURE
 *       2.  SIZE:<n_bytes>\n         — RP2040 opens file buffer
 *       3.  <raw bytes>              — chunked binary transfer
 *   - Monitors RP2040 heartbeat: marks link DEGRADED if silent
 *     for more than HEARTBEAT_TIMEOUT_MS
 *
 * Tested libraries:
 *   ArduinoWebsockets  (Links2004)  ≥ 0.5.4
 *   ArduinoJson                     ≥ 7.x
 *
 * UART1 wiring (ESP32-S3 Nano → RP2040):
 *   GPIO17 (TX1)  →  RP2040 RX
 *   GPIO18 (RX1)  →  RP2040 TX
 * ============================================================
 */

#include <ArduinoJson.h>
#include <ArduinoWebsockets.h>
#include <WiFi.h>
#include <esp_task_wdt.h> // Watchdog

// ── Credentials & endpoint ───────────────────────────────────────
const char *SSID = "Dream 143 F-1";
const char *PASSWORD = "harsh1326";
const char *WS_URL = "ws://bitstream-net.me:8000/ws/hardware?node_id=ESP32-S3";

// ── UART1 pins (dedicated, do NOT conflict with USB-serial) ──────
#define UART_TX_PIN 43
#define UART_RX_PIN 44
#define UART_BAUD 115200

// ── Timing constants ─────────────────────────────────────────────
#define TELEMETRY_INTERVAL_MS 1200 // telemetry frame rate
#define HEARTBEAT_TIMEOUT_MS 5000  // RP2040 link degraded after this
#define WS_RECONNECT_DELAY_MS 3000 // wait between reconnect attempts
#define WATCHDOG_TIMEOUT_S 30      // reboot if loop stalls this long

// ── OTA transfer constants ────────────────────────────────────────
#define OTA_CHUNK_SIZE 512      // bytes per UART chunk to RP2040
#define OTA_ACK_TIMEOUT_MS 4000 // wait for ACK per chunk

using namespace websockets;
WebsocketsClient wsClient;

// ── State ─────────────────────────────────────────────────────────
unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs =
    0; // initialised after Wi-Fi so boot doesn't false-timeout
bool heartbeatValid = false; // becomes true after FIRST heartbeat received
bool rp2040Heartbeat = false;
String fpgaState = "IDLE";
bool fpgaConfigDone = false;
uint32_t packetId = 0;
bool wsConnected = false;

// ── Flash state (set from broker command) ─────────────────────────
struct FlashJob {
  bool pending = false;
  String filename = "";
  size_t fileSize = 0;
};
FlashJob pendingFlash;

// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

/** Convert raw ESP32 internal temp sensor reading to Celsius. */
float readCoreTempC() {
  // temperatureRead() returns °F on ESP-IDF ≥ 5.x; °C on older SDKs.
  // The built-in value is always in Fahrenheit on S3. Convert safely.
  float raw = temperatureRead();
  // If raw > 100 it's almost certainly Fahrenheit
  return (raw > 100.0f) ? (raw - 32.0f) / 1.8f : raw;
}

// ═══════════════════════════════════════════════════════════════════
// WEBSOCKET CALLBACKS
// ═══════════════════════════════════════════════════════════════════

void onWsMessage(WebsocketsMessage msg) {
  esp_task_wdt_reset(); // pet watchdog on every incoming message

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, msg.data()) != DeserializationError::Ok) {
    Serial.println("[WS] Non-JSON message received — ignoring.");
    return;
  }

  const char *type = doc["type"];
  if (!type)
    return;

  if (strcmp(type, "flash_command") == 0) {
    const char *fname = doc["filename"];
    size_t fsize = doc["size"] | 0;

    if (!fname || fsize == 0) {
      Serial.println(
          "[FLASH] Invalid flash_command: missing filename or size.");
      return;
    }

    pendingFlash.filename = String(fname);
    pendingFlash.fileSize = fsize;
    pendingFlash.pending = true;

    Serial.printf("[FLASH] Job queued: %s (%zu bytes)\n", fname, fsize);
  } else if (strcmp(type, "ping") == 0) {
    wsClient.send("{\"type\":\"pong\"}");
  }
}

void onWsEvent(WebsocketsEvent event, String data) {
  if (event == WebsocketsEvent::ConnectionOpened) {
    wsConnected = true;
    Serial.println("[WS] Connected to Mission Control Broker.");
  } else if (event == WebsocketsEvent::ConnectionClosed) {
    wsConnected = false;
    Serial.println("[WS] Connection closed.");
  } else if (event == WebsocketsEvent::GotPing) {
    wsClient.pong();
  }
}

// ═══════════════════════════════════════════════════════════════════
// OTA FLASH — forwards bitstream from broker to RP2040 over UART
// ═══════════════════════════════════════════════════════════════════

/**
 * Waits for a single-line ACK ("ACK\n") or NACK ("NACK\n") from
 * the RP2040. Returns true on ACK, false on NACK or timeout.
 */
bool waitForAck(unsigned long timeoutMs = OTA_ACK_TIMEOUT_MS) {
  unsigned long start = millis();
  String resp = "";
  while (millis() - start < timeoutMs) {
    if (Serial1.available()) {
      char c = Serial1.read();
      if (c == '\n') {
        resp.trim();
        if (resp == "ACK")
          return true;
        if (resp == "NACK") {
          Serial.println("[OTA] NACK received.");
          return false;
        }
        resp = ""; // unexpected line — keep waiting
      } else {
        resp += c;
      }
    }
    delay(1);
  }
  Serial.println("[OTA] ACK timeout.");
  return false;
}

/**
 * Initiates the two-step OTA transfer to the RP2040.
 * The file content must be fetched from the broker server.
 *
 * TODO: Replace HTTP fetch with the chunked WS transfer once
 *       the sliding-window protocol is implemented on the broker.
 */
void dispatchFlashToRP2040(const FlashJob &job) {
  Serial.printf("[OTA] Starting flash: %s (%zu bytes)\n", job.filename.c_str(),
                job.fileSize);

  // Step 1: Tell RP2040 which file is coming
  fpgaState = "RECONFIGURE";
  Serial1.print("FLASH_PREP:");
  Serial1.println(job.filename);

  if (!waitForAck()) {
    Serial.println("[OTA] RP2040 did not acknowledge FLASH_PREP. Aborting.");
    fpgaState = "IDLE";
    return;
  }

  // Step 2: Send size header so RP2040 allocates buffer
  Serial1.print("SIZE:");
  Serial1.println(job.fileSize);

  if (!waitForAck()) {
    Serial.println("[OTA] RP2040 did not acknowledge SIZE. Aborting.");
    fpgaState = "IDLE";
    return;
  }

  // Step 3: Transfer raw binary in chunks
  // TODO: fetch actual file bytes from broker HTTP endpoint
  //       GET http://bitstream-net.me:8000/uploads/<filename>
  //       then stream them here chunk by chunk.
  //
  // Placeholder: send zeroed buffer so the protocol path is exercised.
  size_t sent = 0;
  uint8_t chunk[OTA_CHUNK_SIZE];
  memset(chunk, 0xFF, sizeof(chunk));

  while (sent < job.fileSize) {
    size_t toSend = min((size_t)OTA_CHUNK_SIZE, job.fileSize - sent);
    Serial1.write(chunk, toSend);
    sent += toSend;

    if (!waitForAck(OTA_ACK_TIMEOUT_MS)) {
      Serial.printf("[OTA] Chunk ACK failed at byte %zu. Aborting.\n", sent);
      fpgaState = "IDLE";
      return;
    }

    esp_task_wdt_reset();
  }

  Serial.println(
      "[OTA] Transfer complete. Waiting for RP2040 to flash FPGA...");
  // RP2040 will send FPGA_STATE:USER_MODE via heartbeat path once done
}

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] OTA Mission Control — ESP32-S3 Nano");

  // Watchdog: reboot if main loop stalls
  esp_task_wdt_config_t wdtCfg = {.timeout_ms = WATCHDOG_TIMEOUT_S * 1000,
                                  .idle_core_mask = 0,
                                  .trigger_panic = true};
  esp_task_wdt_reconfigure(&wdtCfg);
  esp_task_wdt_add(NULL);

  // UART1 → Shrike-lite RP2040 (dedicated pins, no USB conflict)
  Serial1.setRxBufferSize(4096);
  Serial1.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
  Serial.printf("[UART] UART1 on TX=%d RX=%d @ %d baud\n", UART_TX_PIN,
                UART_RX_PIN, UART_BAUD);

  // Wi-Fi
  Serial.printf("[WiFi] Connecting to %s", SSID);
  WiFi.begin(SSID, PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++tries > 40) {
      Serial.println("\n[WiFi] Failed. Rebooting.");
      ESP.restart();
    }
  }
  Serial.printf("\n[WiFi] Connected  IP=%s  RSSI=%d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());

  // WebSocket callbacks
  wsClient.onMessage(onWsMessage);
  wsClient.onEvent(onWsEvent);

  // Seed the heartbeat timer AFTER boot so the first 5-second
  // window does not immediately mark the RP2040 link as degraded.
  lastHeartbeatMs = millis();
}

// ═══════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════

void loop() {
  esp_task_wdt_reset();

  // ── 1. Maintain WebSocket connection ─────────────────────────────
  if (!wsConnected) {
    Serial.println("[WS] Reconnecting…");
    if (wsClient.connect(WS_URL)) {
      // onWsEvent sets wsConnected = true
    } else {
      delay(WS_RECONNECT_DELAY_MS);
      return; // skip rest of loop until connected
    }
  }
  wsClient.poll();

  // ── 2. Read UART messages from RP2040 ────────────────────────────
  while (Serial1.available()) {
    String line = Serial1.readStringUntil('\n');
    line.trim();
    if (line.length() == 0)
      continue;

    if (line == "HEARTBEAT") {
      lastHeartbeatMs = millis();
      heartbeatValid = true;
      rp2040Heartbeat = true;

    } else if (line.startsWith("FPGA_STATE:")) {
      fpgaState = line.substring(11);
      fpgaConfigDone = (fpgaState == "USER_MODE");
      Serial.println("[SHRIKE] State → " + fpgaState);

    } else if (line == "OTA_SUCCESS") {
      Serial.println("[SHRIKE] OTA flash confirmed by RP2040.");

    } else {
      // Log any other RP2040 messages (errors, debug) to Serial
      Serial.println("[SHRIKE] " + line);
    }
  }

  // ── 3. Heartbeat timeout ─────────────────────────────────────────
  if (heartbeatValid && (millis() - lastHeartbeatMs > HEARTBEAT_TIMEOUT_MS)) {
    rp2040Heartbeat = false;
  }

  // ── 4. Dispatch pending flash job (non-blocking check) ───────────
  if (pendingFlash.pending) {
    pendingFlash.pending = false;
    dispatchFlashToRP2040(pendingFlash);
  }

  // ── 5. Stream telemetry ───────────────────────────────────────────
  if (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = millis();

    StaticJsonDocument<512> doc;
    doc["type"] = "telemetry";
    doc["node_id"] = "ESP32-S3";

    JsonObject data = doc.createNestedObject("data");
    data["temperature_c"] = readCoreTempC();
    data["supply_voltage_v"] = 3.3f; // TODO: ADC battery read
    data["fpga_config_done"] = fpgaConfigDone;
    data["fpga_state"] = fpgaState;
    data["rssi_dbm"] = WiFi.RSSI();
    data["packet_id"] = ++packetId;
    data["shrike_link"] = rp2040Heartbeat ? "UP" : "DEGRADED";
    data["rp2040_heartbeat"] = rp2040Heartbeat;
    data["uptime_s"] = millis() / 1000;

    String payload;
    serializeJson(doc, payload);

    if (!wsClient.send(payload)) {
      Serial.println("[WS] Send failed — marking disconnected.");
      wsConnected = false;
    }
  }
}