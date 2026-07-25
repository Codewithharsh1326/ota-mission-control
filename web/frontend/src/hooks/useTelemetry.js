/**
 * useTelemetry.js
 * ─────────────────────────────────────────────────────────────────
 * Manages a rolling buffer of real telemetry frames received from
 * the WebSocket broker, and tracks the physical hardware state.
 *
 * Hardware state is driven by explicit broker messages — NOT inferred
 * from the browser's own WebSocket connection status:
 *
 *   system_state  — snapshot sent by broker when browser first connects
 *   hw_connection — broadcast when ESP32 connects or disconnects
 *   telemetry     — live data frames from the ESP32
 */

import { useState, useEffect } from 'react';

const MAX_FRAMES = 50; // Rolling buffer: keep last 50 frames

export function useTelemetry(lastMessage) {
  const [frames, setFrames]             = useState([]);
  const [latestMetrics, setLatestMetrics] = useState(null);
  const [esp32Online, setEsp32Online]   = useState(false); // physical ESP32 state
  const [hwNodes, setHwNodes]           = useState([]);    // kept for header count

  useEffect(() => {
    if (!lastMessage) return;
    const { type } = lastMessage;

    // ── Initial snapshot: broker tells us the current ESP32 state ──────────
    if (type === 'system_state') {
      setEsp32Online(!!lastMessage.hardware_online);
      // If hardware was already offline when we connected, make sure we're clean
      if (!lastMessage.hardware_online) {
        setLatestMetrics(null);
        setFrames([]);
      }
    }

    // ── Physical connect / disconnect events from the broker ───────────────
    if (type === 'hw_connection') {
      const isOnline = lastMessage.status === 'online';
      setEsp32Online(isOnline);
      if (!isOnline) {
        // Hardware dropped — clear stale telemetry
        setLatestMetrics(null);
        setFrames([]);
        setHwNodes([]);
      } else {
        setHwNodes((prev) => [...prev, { node_id: lastMessage.node_id }]);
      }
    }

    // ── Legacy hw_status messages (kept for backwards compat) ──────────────
    if (type === 'hw_status') {
      setHwNodes(lastMessage.nodes ?? []);
    }

    // ── Real telemetry frame from hardware ─────────────────────────────────
    if (type === 'telemetry') {
      const frame = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        ...lastMessage,
      };
      setFrames((prev) => [frame, ...prev].slice(0, MAX_FRAMES));
      setLatestMetrics(lastMessage.data ?? null);
      // Receiving telemetry implicitly confirms ESP32 is online
      setEsp32Online(true);
    }
  }, [lastMessage]);

  return { frames, latestMetrics, esp32Online, hwNodes };
}
