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
web/
├── frontend/                          # Vite + React + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx                    # Root: 3-row CSS Grid (100vh, no scroll)
│   │   ├── index.css                  # Dark theme, animations, glassmorphism, custom scrollbars
│   │   ├── components/
│   │   │   ├── HardwareStatus.jsx     # ESP32-S3 card + Shrike-lite MPSoC card (RP2040 + FPGA)
│   │   │   ├── TelemetryPanel.jsx     # Live WebSocket telemetry + SVG waveform + frame log
│   │   │   ├── OTAUploadZone.jsx      # Drag-and-drop .bit/.bin upload with XHR progress
│   │   │   ├── BitstreamHistory.jsx   # Disk-synced scrollable history table (5s poll)
│   │   │   ├── StatusBadge.jsx        # Reusable status pill (Connected/Halted/Resumed/etc.)
│   │   │   └── RSSIIndicator.jsx      # 5-bar animated Wi-Fi RSSI signal visualizer
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js        # Persistent WS with auto-reconnect + heartbeat ping
│   │   │   └── useTelemetry.js        # Rolling 50-frame buffer + demo data generator
│   │   ├── utils/
│   │   │       └── formatters.js          # Bytes, duration, timestamp, uptime, RSSI formatters
│   │   └── config.js                      # Dynamic API routing — auto-detects dev vs production
│   ├── vite.config.js                 # @tailwindcss/vite plugin + dev proxy to :8000
│   └── index.html                     # SEO meta description + Google Fonts preconnect
│
└── backend/
    ├── main.py                        # FastAPI broker (CORS, WS manager, upload, history, recycle bin)
    ├── requirements.txt               # fastapi, uvicorn, python-multipart, aiofiles, websockets
    └── uploads/                       # Saved bitstreams (auto-created, recycle-bin managed)
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

All HTTP and WebSocket URLs are resolved at runtime using `window.location.hostname` — **no domain names are hardcoded**. This means the same production build works regardless of how the server is accessed (IP, domain, subdomain, or localhost).

```javascript
const BACKEND_PORT = 8000;
const HOST = window.location.hostname;

export const API_BASE_URL = `http://${HOST}:${BACKEND_PORT}`;
export const WS_BASE_URL  = `ws://${HOST}:${BACKEND_PORT}`;
```

| Accessed via | API resolves to | WebSocket resolves to |
|---|---|---|
| `localhost:5173` (dev) | `http://localhost:8000` | `ws://localhost:8000` |
| `bitstream-net.me` | `http://bitstream-net.me:8000` | `ws://bitstream-net.me:8000` |
| `www.bitstream-net.me` | `http://www.bitstream-net.me:8000` | `ws://www.bitstream-net.me:8000` |
| `92.4.80.246` (IP) | `http://92.4.80.246:8000` | `ws://92.4.80.246:8000` |

**Files that consume `config.js`:**

| File | What it uses |
|------|-------------|
| `App.jsx` | `WS_BASE_URL` → `/ws/telemetry` WebSocket |
| `OTAUploadZone.jsx` | `API_BASE_URL` → `POST /upload` |
| `BitstreamHistory.jsx` | `API_BASE_URL` → `GET /api/history` |

> No hardcoded domain names anywhere in the frontend codebase.

---

## CORS Configuration


Allowed origins in `main.py`:

```python
allow_origins=[
    "http://localhost:5173",      # Vite dev server
    "http://localhost:3000",      # Alternative dev port
    "http://92.4.80.246",         # Production server IP
    "http://bitstream-net.me",    # Production domain
    "https://bitstream-net.me",   # Production domain (HTTPS)
]
```

---

## Recycle Bin Policy

After every upload, a **non-blocking background task** enforces:

| Rule | Value |
|------|-------|
| Max files in `uploads/` | **5** (oldest deleted first) |
| Max file age | **5 days** (expired files deleted) |

The History table stays in sync automatically because it reads the filesystem on every poll — no cache invalidation needed.

---

## OTA Upload Pipeline — Future Integration Points

The `/upload` endpoint in `main.py` contains clearly marked `# TODO:` placeholders:

```
[Browser] ──POST multipart──► /upload
  1. ✅ Validate extension (.bit / .bin)
  2. ✅ Save to uploads/{timestamp}_{filename}
  3. 🔲 TODO: AES-256-GCM encrypt payload before transit
  4. 🔲 TODO: Sliding-window chunked transfer to ESP32
           └─ Window: 512 bytes/chunk
           └─ Seq number + CRC32 per chunk
           └─ Hardware ACK/NACK → 3× retry on NACK
           └─ Resume pointer saved on disconnection
  5. ✅ Broadcast upload_complete event to browser WS clients
  6. ✅ Trigger recycle bin cleanup (background task)
```

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


## Connecting Your ESP32-S3

Point the ESP32 firmware to connect WebSocket to:
```
ws://<server-ip>:8000/ws/hardware?node_id=ESP32-S3
```

The broker will immediately notify all open browser dashboards that the node came online, and the Hardware Status panel will switch from `Disconnected` → `Connected` with a breathing glow animation.


 
## Placeholders for Future Integration

In [main.py](file:///home/harsh/Documents/OTA_Server/DCN/web/backend/main.py) the upload pipeline has clearly marked `# TODO:` blocks for:

1. **AES-256-GCM encryption** of payload before transit
2. **Sliding-window chunked transfer** protocol:
   - 512-byte window, sequence numbers, CRC32 per chunk
   - Hardware ACK/NACK handling with 3× retry
   - Resume pointer on disconnection



## Changelog

| Version | Change |
|---------|--------|
| v1.0 | Initial build — full dashboard, FastAPI backend, WebSocket broker |
| v1.1 | Left column widened from `320px` → `420px` for Hardware Status breathing room |
| v1.2 | Merged FPGA card into Shrike-lite — single MPSoC card with RP2040 + FPGA sections separated by hairline divider |
| v1.3 | Added `config.js` — `API_BASE_URL` and `WS_BASE_URL` built from `window.location.hostname:8000` |
| v1.4 | Hardware-only mode — removed all mock/demo telemetry. Cards show `--` until real frames arrive. Waveform flat until data. |
| v1.5 | **Hardware decoupling** — broker tracks `esp32_online` flag. Browser receives `system_state` snapshot + `hw_connection` events. `HardwareStatus` driven by broker events (not browser WS). Shrike-lite driven by `rp2040_heartbeat`. Build: ✓ 1786 modules · 532ms |
| v1.6 | **Two-stage flash pipeline** — clear separation between uploading to server and flashing to ESP32. `OTAUploadZone` retitled "Upload to Server (STEP 1 OF 2)". `BitstreamHistory` replaced by "Available Bitstreams (STEP 2 OF 2)": radio row selection, Flash action bar with `POST /api/flash`, state machine (idle → sending → dispatched ✓ / failed ✗). New backend endpoint `POST /api/flash?filename=` verifies file, forwards `flash_command` to hardware WS, broadcasts `flash_dispatched` to browsers. Build: ✓ 1786 modules · 626ms |
