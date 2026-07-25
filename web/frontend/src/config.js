/**
 * config.js
 * ─────────────────────────────────────────────────────────────────
 * Central API routing — fully dynamic using window.location.hostname.
 *
 * This works correctly regardless of how the app is accessed:
 *   http://localhost:5173        → connects to localhost:8000
 *   http://bitstream-net.me      → connects to bitstream-net.me:8000
 *   http://www.bitstream-net.me  → connects to www.bitstream-net.me:8000
 *   http://92.4.80.246           → connects to 92.4.80.246:8000
 *
 * No hardcoded domain names. The backend port (8000) is the only
 * fixed value here — change it once if the server port changes.
 *
 * Usage:
 *   import { API_BASE_URL, WS_BASE_URL } from '../config';
 *   fetch(`${API_BASE_URL}/upload`)
 *   new WebSocket(`${WS_BASE_URL}/ws/telemetry`)
 */

const BACKEND_PORT = 8000;
const HOST = window.location.hostname;

/**
 * Base URL for all HTTP REST calls (upload, history, health).
 * Resolves to http://<current-host>:8000
 */
export const API_BASE_URL = `http://${HOST}:${BACKEND_PORT}`;

/**
 * Base URL for all WebSocket connections.
 * Resolves to ws://<current-host>:8000
 */
export const WS_BASE_URL = `ws://${HOST}:${BACKEND_PORT}`;
