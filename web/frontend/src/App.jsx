/**
 * App.jsx
 * ─────────────────────────────────────────────────────────────────
 * Root component — Mission Control Dashboard
 *
 * Fixed 100vh CSS Grid layout. No overflow. No scroll.
 * Grid structure:
 *
 *   ┌──────────────────┬─────────────────────────┐  ← Row 1 (top bar, ~44px)
 *   │        HEADER / GLOBAL STATUS BAR           │
 *   ├──────────────────┬─────────────────────────┤  ← Row 2 (main content, flex)
 *   │  Hardware Status │   Live Telemetry Panel   │
 *   │  (left column)   │   (right column)         │
 *   ├──────────────────┼─────────────────────────┤  ← Row 3 (bottom panels)
 *   │  OTA Upload Zone │  Bitstream History       │
 *   │  (left column)   │  (right column, scroll)  │
 *   └──────────────────┴─────────────────────────┘
 */

import { useState, useCallback } from 'react';
import { Satellite, Wifi, WifiOff, Radio, AlertTriangle, Server } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTelemetry } from './hooks/useTelemetry';
import { HardwareStatus } from './components/HardwareStatus';
import { TelemetryPanel } from './components/TelemetryPanel';
import { OTAUploadZone } from './components/OTAUploadZone';
import { BitstreamHistory } from './components/BitstreamHistory';
import { StatusBadge } from './components/StatusBadge';

import { WS_BASE_URL } from './config';

// WebSocket endpoint — auto-routes to localhost in dev, bitstream-net.me in prod
const WS_URL = `${WS_BASE_URL}/ws/telemetry`;

// ─── Header Status Item ───────────────────────────────────────────────────────
function HeaderItem({ label, value, valueColor = '#94a3b8' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
      <span style={{ fontSize: '9px', color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: valueColor, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, style = {} }) {
  return (
    <div
      className="panel panel-glow"
      style={{
        padding: '14px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// =============================================================================
export default function App() {
  const { status: wsStatus, lastMessage, sendMessage } = useWebSocket(WS_URL);
  const { frames, latestMetrics, esp32Online, hwNodes } = useTelemetry(lastMessage);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleUploadComplete = useCallback((result) => {
    // Trigger history table refresh after a successful upload
    setHistoryRefresh((n) => n + 1);
  }, []);

  // Derive WS status label + color for header
  const wsStatusLabel = {
    connected: 'Connected',
    connecting: 'Connecting',
    disconnected: 'Disconnected',
    error: 'Error',
  }[wsStatus] || 'Unknown';

  const wsStatusColor = {
    connected: '#10b981',
    connecting: '#f59e0b',
    disconnected: '#ef4444',
    error: '#ef4444',
  }[wsStatus] || '#64748b';

  const wsIcon = wsStatus === 'connected' ? Wifi : wsStatus === 'connecting' ? Radio : WifiOff;
  const WsIcon = wsIcon;

  const now = new Date().toLocaleTimeString('en-US', { hour12: false });

  return (
    <div
      className="bg-grid"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        gridTemplateRows: '44px 1fr 1fr',
        gridTemplateColumns: '1fr',
        gap: '10px',
        padding: '10px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* ─────────────────────────── HEADER BAR ─────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(13,17,23,0.9)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding: '0 16px',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle top glow line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)',
        }} />

        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(168,85,247,0.2))',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Satellite size={14} color="#00d4ff" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.05em' }}>
              MISSION CONTROL
            </div>
            <div style={{ fontSize: '9px', color: '#334155', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>
              OTA BITSTREAM FLASH SYSTEM · v1.0
            </div>
          </div>
        </div>

        {/* Center status items */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <HeaderItem
            label="Broker WS"
            value={wsStatusLabel}
            valueColor={wsStatusColor}
          />
          <HeaderItem
            label="HW Nodes"
            value={hwNodes.length > 0 ? `${hwNodes.length} online` : 'None'}
            valueColor={hwNodes.length > 0 ? '#10b981' : '#475569'}
          />
          <HeaderItem
            label="Frames Rx"
            value={frames.length.toLocaleString()}
            valueColor={frames.length > 0 ? '#a855f7' : '#475569'}
          />
          <HeaderItem
            label="Signal"
            value={frames.length > 0 ? 'LIVE' : 'IDLE'}
            valueColor={frames.length > 0 ? '#10b981' : '#475569'}
          />
        </div>

        {/* Right side: WS indicator + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <WsIcon size={13} color={wsStatusColor} className={wsStatus === 'connecting' ? 'blink' : ''} />
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: wsStatusColor }}>
              WS
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#475569',
            borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '14px',
          }}>
            {now}
          </div>
        </div>
      </div>

      {/* ─────────────────────── ROW 2: Main Content ──────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '420px 1fr',
        gap: '10px',
        minHeight: 0,
      }}>
        {/* Left: Hardware Status */}
        <Panel>
          <HardwareStatus wsStatus={wsStatus} latestMetrics={latestMetrics} esp32Online={esp32Online} />
        </Panel>

        {/* Right: Live Telemetry */}
        <Panel>
          <TelemetryPanel frames={frames} latestMetrics={latestMetrics} />
        </Panel>
      </div>

      {/* ─────────────────────── ROW 3: Bottom Panels ─────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '420px 1fr',
        gap: '10px',
        minHeight: 0,
      }}>
        {/* Left: OTA Upload Zone */}
        <Panel>
          <OTAUploadZone onUploadComplete={handleUploadComplete} />
        </Panel>

        {/* Right: Bitstream History */}
        <Panel>
          <BitstreamHistory refreshTrigger={historyRefresh} esp32Online={esp32Online} />
        </Panel>
      </div>
    </div>
  );
}
