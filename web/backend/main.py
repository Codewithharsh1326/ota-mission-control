"""
=============================================================================
OTA Mission Control Broker — FastAPI Backend
=============================================================================
Broker between the React frontend dashboard and the hardware edge:
  • ESP32-S3 Nano (WebSocket telemetry source / OTA target)
  • Shrike-lite RP2040 + FPGA (downstream from ESP32)

Endpoints:
  POST /upload          → Receive .bit/.bin bitstream from browser
  GET  /api/history     → Disk-synced list of uploaded bitstreams
  WS   /ws/telemetry    → Bidirectional broker (hardware ↔ browser)
  WS   /ws/hardware     → Hardware client registration endpoint
  GET  /health          → Server health check

Author: OTA Mission Control System
=============================================================================
"""

from fastapi import (
    FastAPI, UploadFile, File, WebSocket,
    WebSocketDisconnect, HTTPException, Query
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import time
import glob
import asyncio
import json
import sqlite3
import logging
from typing import Optional
from datetime import datetime

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ota_broker")

# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------
app = FastAPI(
    title="OTA Mission Control Broker",
    description="Bidirectional broker for ESP32-S3 + Shrike-lite FPGA OTA flashing",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS Middleware
# Fix: Allow Vite dev server (5173), production IP, and domain
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",          # Vite local dev server
        "http://localhost:3000",          # Alternative dev port
        "http://92.4.80.246",             # Production server IP
        "http://bitstream-net.me",        # Production domain
        "https://bitstream-net.me",       # Production domain (HTTPS)
        "http://www.bitstream-net.me",
        "https://www.bitstream-net.me"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constants & Directory Setup
# ---------------------------------------------------------------------------
UPLOAD_DIR = "uploads"
META_DIR   = "uploads/.meta"   # sidecar flash-status JSON files
MAX_FILES = 5           # Recycle bin: keep only last 5 bitstreams
MAX_AGE_DAYS = 5        # Recycle bin: delete files older than 5 days
ALLOWED_EXTENSIONS = {".bit", ".bin"}
TELEMETRY_DB = "telemetry.db"  # SQLite database for historical telemetry

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(META_DIR, exist_ok=True)
logger.info(f"Upload directory ready: {os.path.abspath(UPLOAD_DIR)}")

# ---------------------------------------------------------------------------
# SQLite — Telemetry History
# ---------------------------------------------------------------------------
def init_telemetry_db():
    """Create the telemetry table if it does not already exist."""
    conn = sqlite3.connect(TELEMETRY_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS telemetry (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_rx_ts  REAL    NOT NULL,
            node_id       TEXT    NOT NULL,
            packet_id     INTEGER,
            temperature_c REAL,
            voltage_v     REAL,
            rssi_dbm      INTEGER,
            fpga_state    TEXT,
            uptime_s      INTEGER,
            raw_json      TEXT
        )
    """)
    conn.commit()
    conn.close()
    logger.info(f"Telemetry DB ready: {os.path.abspath(TELEMETRY_DB)}")

init_telemetry_db()


def log_telemetry(frame: dict):
    """Insert one telemetry frame into the SQLite DB (fire-and-forget)."""
    try:
        data = frame.get("data", {})
        conn = sqlite3.connect(TELEMETRY_DB)
        conn.execute("""
            INSERT INTO telemetry
              (broker_rx_ts, node_id, packet_id, temperature_c,
               voltage_v, rssi_dbm, fpga_state, uptime_s, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            frame.get("broker_rx_ts", time.time()),
            frame.get("node_id", "unknown"),
            data.get("packet_id"),
            data.get("temperature_c"),
            data.get("supply_voltage_v"),
            data.get("rssi_dbm"),
            data.get("fpga_state"),
            data.get("uptime_s"),
            json.dumps(frame),
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Telemetry DB write failed: {e}")


# ---------------------------------------------------------------------------
# Sidecar helpers — per-file flash status persisted to .meta/<filename>.json
# ---------------------------------------------------------------------------

def _meta_path(filename: str) -> str:
    return os.path.join(META_DIR, filename + ".json")


def read_flash_status(filename: str) -> str:
    """Return the persisted flash status for a file, defaulting to 'Ready'."""
    try:
        with open(_meta_path(filename)) as f:
            return json.load(f).get("status", "Ready")
    except (FileNotFoundError, json.JSONDecodeError):
        return "Ready"


def write_flash_status(filename: str, status: str, detail: str = ""):
    """Persist flash status to a sidecar JSON file."""
    try:
        with open(_meta_path(filename), "w") as f:
            json.dump({
                "filename": filename,
                "status": status,
                "detail": detail,
                "updated_at": datetime.now().isoformat(),
            }, f)
    except Exception as e:
        logger.warning(f"Could not write flash status for '{filename}': {e}")


# ---------------------------------------------------------------------------
# WebSocket Connection Manager
# Manages two client pools: browser dashboards and hardware nodes
# ---------------------------------------------------------------------------
class ConnectionManager:
    """
    Maintains separate connection pools for:
      - browser_clients: React dashboards subscribing to telemetry
      - hardware_clients: ESP32-S3 nodes pushing telemetry data
    """

    def __init__(self):
        self.browser_clients: list[WebSocket] = []
        self.hardware_clients: list[WebSocket] = []
        self._hardware_meta: dict[WebSocket, dict] = {}  # stores node metadata
        self.esp32_online: bool = False  # strict ESP32 physical connection flag

    # --- Browser dashboard connections ---
    async def connect_browser(self, websocket: WebSocket):
        await websocket.accept()
        self.browser_clients.append(websocket)
        logger.info(f"Browser dashboard connected. Total browsers: {len(self.browser_clients)}")
        # Immediately push the current hardware state to the new browser
        await websocket.send_json({
            "type": "system_state",
            "hardware_online": self.esp32_online,
            "hardware_nodes": len(self.hardware_clients),
        })

    def disconnect_browser(self, websocket: WebSocket):
        if websocket in self.browser_clients:
            self.browser_clients.remove(websocket)
        logger.info(f"Browser dashboard disconnected. Total browsers: {len(self.browser_clients)}")

    # --- Hardware node connections ---
    async def connect_hardware(self, websocket: WebSocket, node_id: str = "ESP32-S3"):
        await websocket.accept()
        self.hardware_clients.append(websocket)
        self._hardware_meta[websocket] = {
            "node_id": node_id,
            "connected_at": datetime.utcnow().isoformat(),
        }
        if node_id == "ESP32-S3":
            self.esp32_online = True
        logger.info(f"Hardware node [{node_id}] connected. Total HW nodes: {len(self.hardware_clients)}")

    def disconnect_hardware(self, websocket: WebSocket):
        node_id = self._hardware_meta.pop(websocket, {}).get("node_id", "unknown")
        if websocket in self.hardware_clients:
            self.hardware_clients.remove(websocket)
        if node_id == "ESP32-S3":
            self.esp32_online = False
        logger.info(f"Hardware node [{node_id}] disconnected. Total HW nodes: {len(self.hardware_clients)}")

    # --- Broadcast telemetry to all browser dashboards ---
    async def broadcast_to_browsers(self, data: dict):
        disconnected = []
        for ws in self.browser_clients:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.warning(f"Failed to send to browser client: {e}")
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect_browser(ws)

    # --- Forward a command from browser to all hardware nodes ---
    async def send_to_hardware(self, data: dict):
        disconnected = []
        for ws in self.hardware_clients:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.warning(f"Failed to send to hardware node: {e}")
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect_hardware(ws)

    @property
    def hardware_status(self) -> list[dict]:
        return list(self._hardware_meta.values())


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Helper: Recycle Bin Cleanup
# Enforces MAX_FILES and MAX_AGE_DAYS constraints after every upload
# ---------------------------------------------------------------------------
async def run_cleanup():
    """
    Recycle bin policy:
      1. Remove files older than MAX_AGE_DAYS
      2. If still over MAX_FILES, remove oldest first
    """
    files = sorted(glob.glob(f"{UPLOAD_DIR}/*"), key=os.path.getmtime)
    now = time.time()

    # Age-based cleanup
    for f in files[:]:
        age_days = (now - os.path.getmtime(f)) / 86400
        if age_days > MAX_AGE_DAYS:
            os.remove(f)
            logger.info(f"Recycle bin: deleted expired file '{f}' (age: {age_days:.1f} days)")
            files.remove(f)

    # Count-based cleanup (keep newest MAX_FILES)
    if len(files) > MAX_FILES:
        for f in files[:-MAX_FILES]:
            os.remove(f)
            logger.info(f"Recycle bin: deleted excess file '{f}' (over limit of {MAX_FILES})")


# ---------------------------------------------------------------------------
# Helper: Format file size
# ---------------------------------------------------------------------------
def format_bytes(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# ===========================================================================
# HTTP ENDPOINTS
# ===========================================================================

@app.get("/health", tags=["System"])
async def health_check():
    """Simple liveness check — used by frontend to verify backend is up."""
    return {
        "status": "online",
        "timestamp": datetime.utcnow().isoformat(),
        "hardware_nodes": len(manager.hardware_clients),
        "browser_clients": len(manager.browser_clients),
    }


# ---------------------------------------------------------------------------
# POST /upload — Receive bitstream from browser
# ---------------------------------------------------------------------------
@app.post("/upload", tags=["OTA"])
async def upload_bitstream(file: UploadFile = File(...)):
    """
    Receives a .bit or .bin file from the React drag-and-drop zone.

    Upload pipeline:
      1. Validate file extension (.bit or .bin only)
      2. Save raw file to uploads/ directory
      3. [TODO] AES-256-GCM encrypt payload before transit
      4. [TODO] Sliding-window chunked transfer to ESP32 over WebSocket
         - Window size: configurable (default 512 bytes / chunk)
         - Each chunk tagged with sequence number + CRC32
         - Hardware ACKs each chunk; retry on NACK (up to 3x)
         - On disconnection: save resume pointer → resume from last ACK'd chunk
      5. Trigger recycle bin cleanup
      6. Return file metadata to frontend
    """
    # --- Validate file type ---
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Only {ALLOWED_EXTENSIONS} are accepted."
        )

    # --- Build timestamped filename to avoid collisions ---
    timestamp_prefix = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp_prefix}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # --- Read and persist file ---
    upload_start = time.monotonic()
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    upload_duration_ms = int((time.monotonic() - upload_start) * 1000)

    file_size = len(content)
    logger.info(
        f"Bitstream uploaded: '{safe_filename}' "
        f"({format_bytes(file_size)}) in {upload_duration_ms}ms"
    )

    # --- Notify all connected browser dashboards ---
    await manager.broadcast_to_browsers({
        "type": "upload_complete",
        "filename": safe_filename,
        "original_name": file.filename,
        "size": file_size,
        "size_human": format_bytes(file_size),
        "path": file_path,
        "duration_ms": upload_duration_ms,
        "status": "Uploaded",
        "timestamp": datetime.now().isoformat(),
    })

    # --- Recycle bin cleanup (non-blocking background task) ---
    asyncio.create_task(run_cleanup())

    return {
        "filename": safe_filename,
        "original_name": file.filename,
        "size": file_size,
        "size_human": format_bytes(file_size),
        "path": file_path,
        "duration_ms": upload_duration_ms,
        "status": "Uploaded",
        "timestamp": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /api/history — Disk-synced bitstream history
# Fix: Reads live from uploads/ so recycle bin deletions auto-sync to UI
# ---------------------------------------------------------------------------
@app.get("/api/history", tags=["OTA"])
async def get_history():
    """
    Returns a live view of the uploads/ directory.
    Because it reads from disk on every call, it stays in sync with
    the recycle bin cleanup task automatically — no cache invalidation needed.
    """
    files = glob.glob(f"{UPLOAD_DIR}/*")
    files.sort(key=os.path.getmtime, reverse=True)  # newest first

    history = []
    for filepath in files:
        try:
            stats = os.stat(filepath)
            mtime = datetime.fromtimestamp(stats.st_mtime)
            fname = os.path.basename(filepath)
            # Skip sidecar meta files if they ever appear in the glob
            if fname.endswith(".json"):
                continue
            history.append({
                "filename": fname,
                "size": stats.st_size,
                "size_human": format_bytes(stats.st_size),
                "timestamp": mtime.strftime("%Y-%m-%d %H:%M:%S"),
                "path": filepath,
                "status": read_flash_status(fname),  # persisted sidecar status
            })
        except FileNotFoundError:
            # File may have been deleted by cleanup between glob and stat
            continue

    return history


# ---------------------------------------------------------------------------
# POST /api/flash — Trigger flash of a server-side bitstream to ESP32
# ---------------------------------------------------------------------------
@app.post("/api/flash", tags=["OTA"])
async def flash_bitstream(filename: str):
    """
    Tells the ESP32-S3 to begin flashing a bitstream already stored in
    the uploads/ directory.

    This endpoint does NOT transfer the file over HTTP to the browser —
    the browser only provides the filename. The broker then:
      1. Verifies the file exists in uploads/
      2. Forwards a flash_command WebSocket message to all hardware nodes
      3. Returns the result (ok / no_hardware / file_not_found)

    The ESP32 firmware then fetches or receives the bitstream via the
    existing hardware WebSocket channel (chunked transfer — TODO).
    """
    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"File '{filename}' not found in uploads directory."
        )

    if not manager.hardware_clients:
        raise HTTPException(
            status_code=503,
            detail="No hardware nodes connected. Cannot dispatch flash command."
        )

    file_size = os.path.getsize(file_path)
    logger.info(
        f"Flash command dispatched: '{filename}' ({format_bytes(file_size)}) "
        f"to {len(manager.hardware_clients)} hardware node(s)"
    )

    # Mark file as 'Flashing' in the sidecar — dashboard reflects this immediately
    write_flash_status(filename, "Flashing", "Flash command dispatched to ESP32")

    # Forward flash command to all connected hardware nodes
    # The ESP32 downloads the bitstream via GET /api/download/<filename>
    # and streams it to the RP2040 over UART (no WS chunking needed).
    await manager.send_to_hardware({
        "type": "flash_command",
        "filename": filename,
        "path": file_path,
        "size": file_size,
        "timestamp": datetime.now().isoformat(),
    })

    # Notify all browser dashboards that a flash was dispatched
    await manager.broadcast_to_browsers({
        "type": "flash_dispatched",
        "filename": filename,
        "size": file_size,
        "hardware_targets": len(manager.hardware_clients),
        "timestamp": datetime.now().isoformat(),
    })

    return {
        "status": "dispatched",
        "filename": filename,
        "size": file_size,
        "hardware_targets": len(manager.hardware_clients),
        "timestamp": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# GET /api/download/{filename} — Serve bitstream file to ESP32 over HTTP
# ---------------------------------------------------------------------------
from fastapi.responses import FileResponse

@app.get("/api/download/{filename}", tags=["OTA"])
async def download_bitstream(filename: str):
    """
    Serves a stored bitstream file as a raw binary response so the
    ESP32-S3 can download it over HTTP and stream it to the RP2040
    via UART for FPGA flashing.

    The ESP32 firmware calls:
      GET http://<broker>:8000/api/download/<filename>
    and streams the response body in 512-byte chunks directly to
    the RP2040 over Serial1 (UART).

    Security: only filenames that exist inside uploads/ are served.
    Path traversal is blocked by os.path.basename().
    """
    safe_name = os.path.basename(filename)   # block path traversal
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"File '{safe_name}' not found in uploads directory."
        )

    logger.info(f"Serving bitstream download: '{safe_name}' to ESP32")
    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        filename=safe_name,
    )


# ===========================================================================
# WEBSOCKET ENDPOINTS
# ===========================================================================

# ---------------------------------------------------------------------------
# WS /ws/telemetry — Browser dashboard connection
# ---------------------------------------------------------------------------
@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """
    Browser dashboards connect here to receive live telemetry.

    Message types the browser will receive:
      { type: "telemetry", data: { temp, voltage, fpga_state, packet_id, ... } }
      { type: "upload_complete", filename, size, ... }
      { type: "hw_status", nodes: [...] }

    Message types the browser can send:
      { type: "flash_command", filename: "...", target: "ESP32" }
      { type: "ping" }
    """
    await manager.connect_browser(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                msg_type = msg.get("type", "unknown")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong", "ts": time.time()})

                elif msg_type == "flash_command":
                    # Browser is requesting a flash → forward to hardware
                    # Note: prefer using POST /api/flash which also writes the
                    # sidecar status. This path is kept for direct WS callers.
                    logger.info(f"Flash command received: {msg.get('filename')}")
                    await manager.send_to_hardware({
                        "type": "flash_command",
                        "filename": msg.get("filename"),
                        "target": msg.get("target", "ESP32"),
                    })

                elif msg_type == "hw_status_request":
                    await websocket.send_json({
                        "type": "hw_status",
                        "nodes": manager.hardware_status,
                    })

            except json.JSONDecodeError:
                logger.warning(f"Received non-JSON from browser: {raw[:100]}")

    except WebSocketDisconnect:
        manager.disconnect_browser(websocket)


# ---------------------------------------------------------------------------
# WS /ws/hardware — Hardware node (ESP32-S3) connection
# ---------------------------------------------------------------------------
@app.websocket("/ws/hardware")
async def websocket_hardware(websocket: WebSocket, node_id: str = Query(default="ESP32-S3")):
    """
    Hardware clients (ESP32-S3) connect here to push telemetry data.

    Expected message format from hardware:
    {
      "type": "telemetry",
      "node_id": "ESP32-S3",
      "data": {
        "temperature_c": 42.3,
        "supply_voltage_v": 3.28,
        "fpga_config_done": true,
        "rssi_dbm": -61,
        "packet_id": 1042,
        "shrike_link": "UP",
        "uptime_s": 3721
      }
    }

    The broker will:
      1. Parse and validate the JSON frame
      2. Broadcast to all connected browser dashboards
      3. [TODO] Log telemetry to time-series DB (InfluxDB / SQLite)
    """
    await manager.connect_hardware(websocket, node_id)

    # Broadcast to all browsers: ESP32 is now online
    await manager.broadcast_to_browsers({
        "type": "hw_connection",
        "status": "online",
        "node_id": node_id,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)

                # Stamp broker receive time
                frame["broker_rx_ts"] = time.time()

                if frame.get("type") == "telemetry":
                    logger.debug(f"Telemetry from [{node_id}]: pkt={frame.get('data', {}).get('packet_id')}")
                    # Log to SQLite for historical waveform / data analysis
                    log_telemetry(frame)
                    # Broadcast live frame to all browser dashboards
                    await manager.broadcast_to_browsers(frame)

                elif frame.get("type") == "ota_result":
                    # ESP32 reports final outcome of a flash operation
                    result  = frame.get("result", "unknown")   # "success" | "failed"
                    fname   = frame.get("filename", "")
                    detail  = frame.get("detail", "")
                    status  = "Flashed" if result == "success" else "Failed"
                    if fname:
                        write_flash_status(fname, status, detail)
                    logger.info(f"OTA result from [{node_id}]: {status} — {fname}")
                    await manager.broadcast_to_browsers({
                        "type":     "ota_result",
                        "node_id":  node_id,
                        "filename": fname,
                        "result":   result,
                        "status":   status,
                        "detail":   detail,
                    })

            except json.JSONDecodeError:
                logger.warning(f"Non-JSON from hardware [{node_id}]: {raw[:100]}")

    except WebSocketDisconnect:
        manager.disconnect_hardware(websocket)
        # Broadcast to all browsers: ESP32 went offline
        await manager.broadcast_to_browsers({
            "type": "hw_connection",
            "status": "offline",
            "node_id": node_id,
        })
