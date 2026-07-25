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
  }, [url]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

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
