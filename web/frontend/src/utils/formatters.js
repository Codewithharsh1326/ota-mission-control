/**
 * formatters.js
 * ─────────────────────────────────────────────────────────────────
 * Utility functions for formatting values in the dashboard.
 */

/** Format byte count into human-readable string */
export function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format milliseconds into human-readable duration */
export function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

/** Format a UNIX timestamp or ISO string to HH:MM:SS */
export function formatTime(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

/** Format a UNIX timestamp or ISO string to HH:MM (no seconds) */
export function formatTimeShort(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

/** Format a full ISO timestamp to readable date-time */
export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour12: false }).replace(',', '');
}

/** Format uptime in seconds to human-readable string */
export function formatUptime(seconds) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Map RSSI dBm to signal bars (0-5) */
export function rssiToBars(rssiDbm) {
  if (rssiDbm == null) return 0;
  if (rssiDbm >= -50) return 5;
  if (rssiDbm >= -60) return 4;
  if (rssiDbm >= -70) return 3;
  if (rssiDbm >= -80) return 2;
  if (rssiDbm >= -90) return 1;
  return 0;
}

/** Map RSSI bars to color class */
export function rssiToColor(bars) {
  if (bars >= 4) return '#10b981';
  if (bars >= 3) return '#f59e0b';
  if (bars >= 2) return '#f97316';
  return '#ef4444';
}
