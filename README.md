# README — OTA Mission Control Web System

> **Stack:** React 18 · Vite · Tailwind CSS · FastAPI · WebSockets  
> **Hardware target:** ESP32-S3 Nano → Shrike-lite MPSoC (RP2040 + FPGA)  
> **Server:** Ubuntu Linux · `bitstream-net.me` · `92.4.80.246`

---

## Overview

A production-grade, fixed `100vh` Mission Control Dashboard for the ESP32-S3 Nano + Shrike-lite (RP2040 + FPGA on a single MPSoC) OTA bitstream flashing and live telemetry pipeline.

The system has two runtime components that must both be running:

| Component | Port | Command |
|-----------|------|---------|
| **FastAPI backend** broker | `8000` | `uvicorn main:app --reload` |
| **Vite dev server** (React) | `5173` | `npm run dev` |

During development, Vite proxies all `/upload`, `/api`, and `/ws` requests automatically to port `8000` — no CORS errors.

---

## Project Structure

```
ota-mission-control/
├── README.md
├── .gitignore
│
├── esp32_ws/
│   └── esp32_ws.ino              # ESP32-S3 Arduino firmware
│
├── Micro_py/
│   └── main.py                   # RP2040 MicroPython firmware (Shrike-lite)
│
└── web/
    ├── frontend/                 # Vite + React + Tailwind CSS
    │   ├── src/
    │   │   ├── App.jsx           # Root: 3-row CSS Grid (100vh, no scroll)
    │   │   ├── index.css         # Dark theme, glassmorphism, animations
    │   │   ├── config.js         # Dynamic API routing (window.location.hostname)
    │   │   ├── components/
    │   │   │   ├── HardwareStatus.jsx     # ESP32-S3 + Shrike-lite MPSoC cards
    │   │   │   ├── TelemetryPanel.jsx     # Live WS telemetry, SVG waveform, frame log
    │   │   │   ├── OTAUploadZone.jsx      # Drag-and-drop .bit/.bin upload (Step 1)
    │   │   │   ├── BitstreamHistory.jsx   # Radio select + Flash to ESP32 (Step 2)
    │   │   │   ├── StatusBadge.jsx        # Reusable status pill component
    │   │   │   └── RSSIIndicator.jsx      # 5-bar animated Wi-Fi RSSI visualizer
    │   │   ├── hooks/
    │   │   │   ├── useWebSocket.js        # Persistent WS with auto-reconnect
    │   │   │   └── useTelemetry.js        # Rolling frame buffer + hw_connection handler
    │   │   └── utils/
    │   │       └── formatters.js          # Bytes, duration, uptime, RSSI formatters
    │   ├── vite.config.js
    │   └── index.html
    │
    └── backend/
        ├── main.py               # FastAPI broker (WS, upload, flash, download, SQLite logging)
        ├── requirements.txt
        ├── telemetry.db          # SQLite — auto-created on first run
        └── uploads/              # Saved bitstreams (auto-created, recycle-bin managed)
            └── .meta/            # Sidecar flash-status JSON files (auto-created)
```

---

## How to Run

### 1 — Backend (FastAPI)

```bash
cd web/backend

# First time: create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start server — accessible on all interfaces
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2 — Frontend (React + Vite)

```bash
cd web/frontend

# Development (hot reload, proxies to :8000 automatically)
npm run dev               # → http://localhost:5173

# Production build
npm run build
npm run preview
```

---

## Dashboard Layout

Fixed `100vh` CSS Grid — **no scrolling at any level**. Left column is `420px` wide; right column takes the remaining `1fr`.

```
┌──────────────────────────── HEADER BAR (44px) ──────────────────────────────┐
│  🛰 MISSION CONTROL · OTA BITSTREAM FLASH SYSTEM v1.0    WS · HH:MM:SS UTC  │
├──────────────────────────┬──────────────────────────────────────────────────┤
│   HARDWARE STATUS        │   LIVE TELEMETRY                                  │
│   (420px)                │   (1fr)                                           │
│   ┌─────────────────┐    │   Metric cards: Temp · Voltage · Packet ID · Rate │
│   │  ESP32-S3 Nano  │    │   SVG waveform (temperature, last 30 frames)      │
│   │  Uptime/Temp/V  │    │   Scrollable frame log with slide-in animation    │
│   │  RSSI bars      │    │                                                   │
│   └─────────────────┘    │                                                   │
│   ┌─────────────────┐    │                                                   │
│   │  Shrike-lite    │    │                                                   │
│   │  MPSoC          │    │                                                   │
│   │  ─ RP2040 ────  │    │                                                   │
│   │    SPI/I²C link │    │                                                   │
│   │    Packets Rx   │    │                                                   │
│   │  ─ FPGA ──────  │    │                                                   │
│   │    Config done  │    │                                                   │
│   │    State mach.  │    │                                                   │
│   └─────────────────┘    │                                                   │
├──────────────────────────┼──────────────────────────────────────────────────┤
│   OTA UPLOAD ZONE        │   BITSTREAM HISTORY                               │
│   (420px)                │   (1fr, internal scroll)                          │
│   Drag & drop .bit/.bin  │   Filename · Size · Server Path · Timestamp · Status│
│   Progress bar + cancel  │   Polls /api/history every 5 seconds              │
└──────────────────────────┴──────────────────────────────────────────────────┘
```

---

## Dashboard Panels

### 🟢 Hardware Status (Top-Left, 420px wide)

Two node cards stacked vertically:

#### ESP32-S3 Nano
- Default: **Disconnected** — status driven exclusively by `hw_connection` broker events, NOT the browser's own WebSocket status
- `hw_connection: online`  → `Connected` (green glow)
- `hw_connection: offline` → `Disconnected` (red)
- Browser WS status (`Connecting`) still shown while the broker link is being established

#### Shrike-lite MPSoC *(RP2040 + FPGA — single board)*
- Default: **Disconnected** until ESP32 is online; **Halted** when ESP32 is online but RP2040 link is unconfirmed
- Status driven by `rp2040_heartbeat` field in telemetry (primary) or `shrike_link` field (fallback):
  - `rp2040_heartbeat: true`  → `Connected` (green)
  - `rp2040_heartbeat: false` → `Halted` (amber)
  - `shrike_link: "UP"`       → `Connected` (fallback when heartbeat field absent)
  - `shrike_link: "DEGRADED"` → `Halted` (fallback)
- When ESP32 goes offline, Shrike-lite immediately drops to **Disconnected**
- Single card with hairline divider between RP2040 and FPGA sub-sections
- All metrics show `--` by default until data arrives

> **Architecture note:** Shrike-lite is a single MPSoC PCB. The RP2040 microcontroller handles the SPI/I²C configuration bridge between the ESP32-S3 and the onboard FPGA fabric. There is no separate FPGA board.

### 📡 Live Telemetry (Top-Right)
- **4 metric cards**: Core Temp · Supply Voltage · Packet ID · Packet Rate
  - All show `--` placeholder when no hardware is connected
  - Packet Rate is computed live from real frame timestamps (not hardcoded)
- **SVG waveform**: Temperature over last 30 frames — stays flat/empty until real frames arrive
- **Scrollable frame log**: Each frame shows timestamp, packet ID, T / V / FPGA status, RSSI bars
  - Empty state: icon + "No telemetry — connect hardware to begin" message
- **LIVE badge** (green blink dot): only shown when real frames are arriving
- **WAITING label**: shown when frame buffer is empty (no hardware connected)
- No demo/mock data — the panel is always in hardware-only mode

### 📤 Upload to Server — Step 1 of 2 (Bottom-Left)
- Animated dashed border (idle pulse → cyan glow on hover → solid on drag-over)
- Validates `.bit` / `.bin` only — rejects any other extension immediately
- XHR-based upload with real-time `%` progress bar (shimmer animation during transfer)
- Displays upload duration + server-side save path on success
- Cancel button aborts the XHR mid-upload
- **Labelled STEP 1 OF 2** — clearly indicates this only saves the file to the server; the flash to hardware is a separate action in the panel below

### 🔲 Available Bitstreams — Step 2 of 2 (Bottom-Right)

Replaces the old "Bitstream History" panel. Keeps a clear two-stage separation:

| Stage | Panel | Action |
|-------|-------|--------|
| **Step 1** | Upload to Server | Browser → `POST /upload` → file saved in `uploads/` on server |
| **Step 2** | Available Bitstreams | User selects file → `POST /api/flash` → broker → ESP32 WebSocket |

- Polls `GET /api/history` every **5 seconds** — live disk view, no cache
- **Radio-button selection** — click any row to select ONE file at a time (purple highlight)
- **Flash action bar** (top of panel) shows the selected filename and the **Flash to ESP32** button:
  - Button is **enabled** only when: a file is selected AND `esp32Online == true`
  - Button is **disabled** with tooltip message when ESP32 is offline
  - Flash states: `idle` → `sending…` → `dispatched ✓` / `failed ✗` (auto-resets after 4–5 s)
- **Hardware-offline warning strip** shown at the bottom when ESP32 is disconnected
- Status badge per row:
  - ESP32 online → `Ready to Flash` (cyan, blinking dot on selected row)
  - ESP32 offline → `Awaiting Hardware` (amber dot)
- Columns: **●** (radio) · **Filename** · **Size** · **Uploaded At** · **Status**

---

## Backend API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Liveness check — returns online status + connected node counts |
| `POST` | `/upload` | Receive `.bit`/`.bin` multipart file, save with timestamp prefix, broadcast `upload_complete` to all browser WS clients |
| `GET`  | `/api/history` | Live `os.stat()` scan of `uploads/` — disk-synced, no in-memory cache |
| `POST` | `/api/flash?filename=<file>` | Trigger flash of server-side bitstream to ESP32 — verifies file exists, forwards `flash_command` over hardware WS, returns `{ status, filename, hardware_targets }` |
| `GET`  | `/api/download/{filename}` | Serve raw bitstream binary to ESP32 over HTTP — ESP32 calls this then streams bytes to RP2040 over UART |
| `WS`   | `/ws/telemetry` | Browser dashboard WebSocket — receives telemetry, receives broker events |
| `WS`   | `/ws/hardware?node_id=ESP32-S3` | Hardware node WebSocket — pushes telemetry frames, receives OTA flash commands |

### WebSocket Broker Architecture

The backend maintains **two separate connection pools**:

```
ESP32-S3  ──WS──►  /ws/hardware  ──► ConnectionManager ──► /ws/telemetry  ──WS──►  Browser
  (push telemetry)                    (broker)                (receive telemetry)
  (receive OTA chunks)                                        (send flash commands)
```

**Telemetry frame format (hardware → broker → browser):**
```json
{
  "type": "telemetry",
  "node_id": "ESP32-S3",
  "data": {
    "temperature_c": 42.3,
    "supply_voltage_v": 3.28,
    "fpga_config_done": true,
    "fpga_state": "USER_MODE",
    "rssi_dbm": -61,
    "packet_id": 1042,
    "shrike_link": "UP",
    "rp2040_heartbeat": true,
    "uptime_s": 3721
  }
}
```

**Broker → browser: system state snapshot (sent on browser connect):**
```json
{ "type": "system_state", "hardware_online": false, "hardware_nodes": 0 }
```

**Broker → browser: hardware connection events:**
```json
{ "type": "hw_connection", "status": "online",  "node_id": "ESP32-S3" }
{ "type": "hw_connection", "status": "offline", "node_id": "ESP32-S3" }
```

**Broker → browser: flash dispatched event:**
```json
{ "type": "flash_dispatched", "filename": "top_20240725.bit", "size": 512000, "hardware_targets": 1 }
```

**Broker → browser: OTA result event** (status persisted to sidecar + pushed to dashboard):
```json
{ "type": "ota_result", "node_id": "ESP32-S3", "filename": "top.bit", "result": "success", "status": "Flashed" }
{ "type": "ota_result", "node_id": "ESP32-S3", "filename": "top.bit", "result": "failed",  "status": "Failed",  "detail": "Incomplete transfer" }
```

**Broker → hardware: flash command (forwarded from /api/flash):**
```json
{ "type": "flash_command", "filename": "top_20240725.bit", "path": "uploads/...", "size": 512000 }
```

**Browser → broker (commands):**
```json
{ "type": "flash_command", "filename": "top_20240725.bit", "target": "ESP32" }
{ "type": "ping" }
{ "type": "hw_status_request" }
```

## Dynamic API Routing (`config.js`)

All HTTP and WebSocket URLs are resolved at runtime using `window.location` — **no hardcoded port or domain**. Since Nginx now terminates TLS on port 443 and reverse-proxies `/api/`, `/upload`, and `/ws/` to the backend, the app uses whichever port and protocol the browser is currently on.

```javascript
const HOST        = window.location.host;     // host + port if non-standard
const PROTOCOL    = window.location.protocol; // "https:" or "http:"
const WS_PROTOCOL = PROTOCOL === 'https:' ? 'wss:' : 'ws:';

export const API_BASE_URL = `${PROTOCOL}//${HOST}`;
export const WS_BASE_URL  = `${WS_PROTOCOL}//${HOST}`;
```

| Accessed via | `API_BASE_URL` | `WS_BASE_URL` |
|---|---|---|
| `localhost:5173` (dev) | `http://localhost:5173` | `ws://localhost:5173` |
| `https://bitstream-net.me` | `https://bitstream-net.me` | `wss://bitstream-net.me` |
| `https://www.bitstream-net.me` | `https://www.bitstream-net.me` | `wss://www.bitstream-net.me` |
| `http://92.4.80.246` (IP) | `http://92.4.80.246` | `ws://92.4.80.246` |

> On dev, Vite proxies all `/api`, `/upload`, `/ws` requests to `localhost:8000` (configured in `vite.config.js`), so no Nginx is needed locally.

## Firmware

### ESP32-S3 Nano — [`esp32_ws/esp32_ws.ino`](esp32_ws/esp32_ws.ino)

**Libraries required** (install via Arduino Library Manager):
- `ArduinoWebsockets` by Links2004 ≥ 0.5.4
- `ArduinoJson` ≥ 7.x
- `HTTPClient` (bundled with Arduino-ESP32 core)
- `esp_task_wdt` (bundled with Arduino-ESP32 core)

**Key behaviour:**
- Auto-connects to `wss://bitstream-net.me/ws/hardware?node_id=ESP32-S3` (TLS, via Nginx)
- Reconnects automatically on drop (3 s back-off)
- Streams a telemetry JSON frame every **1.2 s** (temperature, live ADC voltage, RSSI, uptime, FPGA state)
- UART1 on **GPIO 0 (TX) / GPIO 1 (RX)** — matches user hardware wiring
- 30-second watchdog reboot on stall
- `temperatureRead()` auto-converts Fahrenheit → Celsius for ESP-IDF ≥ 5.x

**Supply Voltage — live ADC read:**
- Reads A7 (GPIO 14) via a resistive voltage divider
- Two constants at the top of the sketch to configure for your hardware:
  ```cpp
  #define VOLTAGE_ADC_PIN  A7      // GPIO14
  #define R1_KOHM          10.0f   // upper resistor (kΩ)
  #define R2_KOHM          10.0f   // lower resistor (kΩ)
  ```
- Formula: `V_supply = (raw/4095 × 3.3) × (R1+R2)/R2`

**OTA flash flow (on receiving `flash_command` from broker):**
1. Send `FLASH_PREP:<filename>\n` to RP2040 → wait `ACK`
2. Send `SIZE:<n>\n` → wait `ACK`
3. `GET https://bitstream-net.me/api/download/<filename>` (via Nginx TLS) — stream response to RP2040 in 512 B chunks → wait `ACK` per chunk
4. On completion: send `{ type: "ota_result", result: "success"|"failed" }` to broker

**Security note:** Runs on a trusted private network. In-band AES-256-GCM is not implemented; add mbedTLS if open-internet deployment is required.

**UART to Shrike-lite wiring:**

| ESP32-S3 Pin | Direction | RP2040 Pin |
|---|---|---|
| GPIO 0 (TX1) | → | GPIO 29 (RX0) |
| GPIO 1 (RX1) | ← | GPIO 28 (TX0) |

---

### Shrike-lite RP2040 — [`Micro_py/main.py`](Micro_py/main.py)

**Runtime:** MicroPython on RP2040 (Vicharak Shrike-lite board)

**Libraries used** (provided by Vicharak for Shrike-lite):
- `shrike` — FPGA configuration API (`shrike.flash(filename)` programs bitstream)
- `machine` — standard MicroPython hardware abstraction

**UART assignment (do not change):**

| RP2040 Pin | Signal | Connected to |
|---|---|---|
| GPIO 28 (TX0) | TX → ESP32 | ESP32 GPIO 1 (RX1) |
| GPIO 29 (RX0) | RX ← ESP32 | ESP32 GPIO 0 (TX1) |

**FPGA reset pin:** GPIO 14 (active-LOW pulse)

**Key behaviour:**
- On boot: flashes `FPGA_bitstream_MCU.bin` (factory default), resets FPGA, reports `FPGA_STATE:USER_MODE`
- If boot bitstream missing: reports `FPGA_STATE:IDLE` and waits for OTA
- Sends `HEARTBEAT` every **4 s** (ESP32 degrades link after 5 s silence)
- Listens for OTA protocol from ESP32:
  1. `FLASH_PREP:<filename>` → ACK, enter CONFIGURE state
  2. `SIZE:<n>` → ACK, open `ota_update.bin` for writing
  3. Raw chunks (256 B) → ACK each; NACK + abort on 8 s timeout
  4. When all bytes received: `shrike.flash("ota_update.bin")` → hard reset → `OTA_SUCCESS` + `FPGA_STATE:USER_MODE`

**FPGA state machine reported via UART:**

| State | Dashboard badge | Meaning |
|-------|----------------|----------|
| `IDLE` | Halted (amber) | Waiting for bitstream |
| `CONFIGURE` | Halted (amber) | Receiving OTA data |
| `USER_MODE` | Connected (green) | FPGA running user design |
| `RECONFIGURE` | Halted (purple) | Flash sequence initiated |

---

## CORS Configuration

Allowed origins in `main.py`. Nginx TLS proxy means requests arrive from the standard HTTPS/WSS origin — no port suffix:

```python
allow_origins=[
    "http://localhost:5173",           # Vite dev server
    "http://localhost:3000",           # Alternative dev port
    "http://92.4.80.246",              # Production server IP (HTTP)
    "https://92.4.80.246",             # Production server IP (HTTPS)
    "http://bitstream-net.me",         # Production domain (HTTP)
    "https://bitstream-net.me",        # Production domain (HTTPS)
    "http://www.bitstream-net.me",     # www alias (HTTP)
    "https://www.bitstream-net.me",    # www alias (HTTPS)
]
```

## Recycle Bin Policy

After every upload, a **non-blocking background task** enforces:

| Rule | Value |
|------|-------|
| Max files in `uploads/` | **5** (oldest deleted first) |
| Max file age | **5 days** (expired files deleted) |

The History table stays in sync automatically because it reads the filesystem on every poll — no cache invalidation needed.

---

## OTA Upload Pipeline

```
[Browser] ──POST multipart──► /upload
  1. ✅ Validate extension (.bit / .bin)
  2. ✅ Save to uploads/{timestamp}_{filename}
  3. ✅ Broadcast upload_complete event to browser WS clients
  4. ✅ Trigger recycle bin cleanup (background task)

[Browser] ──POST /api/flash?filename=──► Broker
  1. ✅ Verify file exists in uploads/
  2. ✅ Write sidecar status → "Flashing" (uploads/.meta/<filename>.json)
  3. ✅ Forward flash_command to ESP32 over /ws/hardware
  4. ✅ Broadcast flash_dispatched to all browser dashboards

[ESP32] ──GET /api/download/<filename>──► Broker HTTP
  1. ✅ Stream response body to RP2040 over UART in 512 B chunks (ACK-gated)
  2. ✅ Send ota_result { result: "success"|"failed" } back to broker via WS

[Broker] receives ota_result
  1. ✅ Write sidecar status → "Flashed" or "Failed"
  2. ✅ Broadcast ota_result event to all browser dashboards
  3. ✅ Log each telemetry frame to SQLite (telemetry.db)
```

> **Payload encryption:** The system runs on a trusted private network with TLS at the
> server boundary. In-band AES-256-GCM is not implemented. To add it, encrypt the
> `FileResponse` bytes in `main.py` before serving, and add an `mbedTLS` AES-GCM
> decrypt step in the ESP32 HTTP stream loop before forwarding to UART.

---

## Connecting Your ESP32-S3 Nano

Point the ESP32 firmware WebSocket client to:

```
ws://<server-ip>:8000/ws/hardware?node_id=ESP32-S3
```

On connect the broker will:
1. Accept the hardware WebSocket
2. Immediately broadcast a `hw_status { event: "connected" }` message to all open browser dashboards
3. The Hardware Status panel will animate from `Disconnected` → `Connected` with breathing glow + scan-line

For Shrike-lite telemetry fields, include `shrike_link`, `fpga_config_done`, and `fpga_state` in every telemetry JSON frame sent from the ESP32.

---

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#080b12` | Page background |
| `--bg-panel` | `#0d1117` | Panel background |
| `--cyan` | `#00d4ff` | Primary accent, active borders |
| `--emerald` | `#10b981` | Connected / healthy state |
| `--amber` | `#f59e0b` | Warning / degraded state |
| `--red` | `#ef4444` | Error / disconnected state |
| `--purple` | `#a855f7` | FPGA RECONFIGURE / demo mode |
| `--font-ui` | `Inter` | Labels, UI text |
| `--font-mono` | `JetBrains Mono` | Data values, telemetry, paths |

### Animations available (`index.css`)

| Class | Effect |
|-------|--------|
| `.breathe-glow` | Slow emerald glow pulse (connected state) |
| `.amber-breathe` | Amber glow pulse (connecting/degraded) |
| `.scan-line` | Vertical cyan scan line sweep |
| `.blink` | Opacity blink (LIVE dot, WS indicator) |
| `.slide-in` | Slide-in from left (new telemetry frames) |
| `.shimmer` | Horizontal shimmer (upload progress bar) |
| `.dropzone-idle` | Border color pulse (upload zone idle) |
| `.spin` | 360° rotation (loading spinner) |
| `.fade-in` | Opacity fade in (success/error states) |

---



## Changelog

| Version | Change |
|---------|--------|
| v1.0 | Initial build — full dashboard, FastAPI backend, WebSocket broker |
| v1.1 | Left column widened from `320px` → `420px` for Hardware Status breathing room |
| v1.2 | Merged FPGA card into Shrike-lite — single MPSoC card with RP2040 + FPGA sections separated by hairline divider |
| v1.3 | Added `config.js` — `API_BASE_URL` and `WS_BASE_URL` built from `window.location.hostname:8000` |
| v1.4 | Hardware-only mode — removed all mock/demo telemetry. Cards show `--` until real frames arrive. Waveform flat until data. |
| v1.5 | **Hardware decoupling** — broker tracks `esp32_online` flag. Browser receives `system_state` snapshot + `hw_connection` events. `HardwareStatus` driven by broker events (not browser WS). Shrike-lite driven by `rp2040_heartbeat`. Build: ✓ 1786 modules · 532ms |
| v1.6 | **Two-stage flash pipeline** — `OTAUploadZone` → "Upload to Server (STEP 1)". `BitstreamHistory` → "Available Bitstreams (STEP 2)": radio row selection, Flash action bar, `POST /api/flash` endpoint. Build: ✓ 1786 modules · 626ms |
| v1.7 | **Firmware hardening** — ESP32: UART pins (0/1), watchdog, onEvent callback, °F→°C fix, ACK/NACK OTA protocol, heartbeat boot guard. RP2040: `split(':', 1)` colon-safe parse, heartbeat reset after boot flash. GitHub repo: `Codewithharsh1326/ota-mission-control`. |
| v1.8 | **Real file transfer** — `GET /api/download/{filename}` backend endpoint (path-traversal blocked). ESP32 uses `HTTPClient` to stream bitstream → Serial1 UART → RP2040 in 512 B chunks with ACK gate per chunk. |
| v1.9 | **All TODOs completed** — (1) Removed dead ACK/NACK WS code. (2) Live ADC supply voltage on A7/GPIO14 with configurable R1/R2 voltage divider. (3) AES TODO replaced with architecture note. (4) SQLite telemetry logging (`telemetry.db`). (5) Per-file flash status via sidecar `uploads/.meta/<filename>.json`; states: Ready → Flashing → Flashed/Failed. ESP32 sends `ota_result`; broker writes sidecar + broadcasts to dashboard. |
| v2.0 | **HTTPS / WSS production upgrade** — Nginx now terminates TLS on port 443 (Let's Encrypt cert for `bitstream-net.me`). Nginx reverse-proxies `/api/`, `/upload`, `/ws/` to FastAPI on `localhost:8000`. `config.js` updated to `window.location.host` + dynamic `https:`/`wss:` protocol — port 8000 no longer exposed to the internet. ESP32 firmware updated to `wss://bitstream-net.me` and `https://bitstream-net.me` (no explicit port). CORS allowed origins updated to include `https://92.4.80.246`. |
