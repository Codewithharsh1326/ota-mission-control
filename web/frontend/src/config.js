/**
 * config.js
 * ─────────────────────────────────────────────────────────────────
 * Central API routing — fully dynamic using window.location.
 *
 * Now that Nginx terminates HTTPS on port 443 and reverse-proxies
 * /api/, /upload, and /ws/ to the FastAPI backend on port 8000,
 * the React app no longer needs to hard-code port 8000.
 *
 * How it resolves at runtime:
 *
 *   Environment               API_BASE_URL               WS_BASE_URL
 *   ─────────────────────────────────────────────────────────────────
 *   localhost:5173 (dev)      http://localhost:5173      ws://localhost:5173
 *   http://92.4.80.246        http://92.4.80.246         ws://92.4.80.246
 *   https://bitstream-net.me  https://bitstream-net.me   wss://bitstream-net.me
 *   https://www.bitstream-…   https://www.bitstream-…    wss://www.bitstream-…
 *
 * The Vite dev proxy (vite.config.js) forwards /api, /upload, /ws
 * to localhost:8000, so dev still works without Nginx.
 *
 * Usage:
 *   import { API_BASE_URL, WS_BASE_URL } from '../config';
 *   fetch(`${API_BASE_URL}/upload`)
 *   new WebSocket(`${WS_BASE_URL}/ws/telemetry`)
 */

const HOST        = window.location.host;       // e.g. "bitstream-net.me" or "localhost:5173"
const PROTOCOL    = window.location.protocol;   // "https:" or "http:"
const WS_PROTOCOL = PROTOCOL === 'https:' ? 'wss:' : 'ws:';

/**
 * Base URL for all HTTP REST calls (upload, history, flash, download).
 * On production: https://bitstream-net.me  (Nginx proxies /api, /upload)
 * On dev:        http://localhost:5173      (Vite dev proxy handles /api, /upload)
 */
export const API_BASE_URL = `${PROTOCOL}//${HOST}`;

/**
 * Base URL for all WebSocket connections.
 * On production: wss://bitstream-net.me   (Nginx proxies /ws/)
 * On dev:        ws://localhost:5173       (Vite dev proxy handles /ws/)
 */
export const WS_BASE_URL = `${WS_PROTOCOL}//${HOST}`;
