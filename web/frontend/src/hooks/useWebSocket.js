/**
 * useWebSocket.js
 * ─────────────────────────────────────────────────────────────────
 * Custom React hook for managing a persistent WebSocket connection.
 * Handles: auto-reconnect, heartbeat pings, message parsing,
 * and clean teardown on component unmount.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 15000;

export function useWebSocket(url) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const [lastMessage, setLastMessage] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const clearTimers = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
  };

  const startHeartbeat = (ws) => {
    heartbeatTimerRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const connect = useCallback(() => {
    if (!mountedRef.current || !url) return;

    if (isLocalhost) {
      // ── MOCK DATA MODE (Localhost only) ──
      setStatus('connected');
      
      // Simulate initial broker connect
      setTimeout(() => {
        if (!mountedRef.current) return;
        setLastMessage({ type: 'system_state', hardware_online: true, hardware_nodes: 1 });
        setLastMessage({ type: 'hw_connection', status: 'online', node_id: 'ESP32-S3 (Mock)' });
      }, 500);

      let pktId = 1000;
      let temp = 45.0;
      let volt = 3.3;

      const interval = setInterval(() => {
        if (!mountedRef.current) return;
        
        // Random walk for realistic fluctuating graph data
        temp += (Math.random() - 0.5) * 1.5;
        volt += (Math.random() - 0.5) * 0.04;
        if (temp < 38) temp = 38; if (temp > 68) temp = 68;
        if (volt < 3.1) volt = 3.1; if (volt > 3.5) volt = 3.5;
        
        pktId++;

        setLastMessage({
          type: 'telemetry',
          node_id: 'ESP32-S3 (Mock)',
          data: {
            temperature_c: temp,
            supply_voltage_v: volt,
            fpga_config_done: true,
            fpga_state: 'USER_MODE',
            rssi_dbm: -40 - Math.floor(Math.random() * 30),
            packet_id: pktId,
            shrike_link: 'UP',
            rp2040_heartbeat: true,
            uptime_s: Math.floor(Date.now() / 1000)
          }
        });
      }, 1200); // 1.2s interval to match actual hardware

      heartbeatTimerRef.current = interval;
      return;
    }

    // ── REAL WEBSOCKET MODE (Production Server) ──
    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus('connected');
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data);
        setLastMessage(parsed);
      } catch {
        setLastMessage({ type: 'raw', data: event.data });
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      clearTimers();
      setStatus('disconnected');
      // Auto-reconnect after delay
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [url, isLocalhost]);

  const sendMessage = useCallback((data) => {
    if (isLocalhost) {
      console.log('Mock WS Sent:', data);
      return true;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, [isLocalhost]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimers();
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, lastMessage, sendMessage };
}
