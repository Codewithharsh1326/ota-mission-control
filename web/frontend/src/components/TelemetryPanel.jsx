/**
 * TelemetryPanel.jsx
 * ─────────────────────────────────────────────────────────────────
 * Displays live telemetry streamed from the hardware via WebSocket.
 *
 * Features:
 *  • Metric cards: Core Temp · Supply Voltage · Packet ID · Packet Rate
 *  • SVG waveform of temperature over last 30 frames (flat/empty until data arrives)
 *  • Scrollable frame log with slide-in animation per new frame
 *  • LIVE badge (blink dot) only shown when real frames are arriving
 *  • All values show "--" placeholder when no hardware is connected
 */

import { useRef, useEffect, useMemo } from 'react';
import { Activity, Thermometer, Zap, Package, Clock } from 'lucide-react';
import { formatTime } from '../utils/formatters';
import { RSSIIndicator } from './RSSIIndicator';

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, unit, color = '#00d4ff', warning = false }) {
  const isEmpty = value == null;
  return (
    <div style={{
      background: warning ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${warning ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '10px',
      padding: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flex: '1 1 0',
      minWidth: 0,
      transition: 'border-color 0.3s, background 0.3s',
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '8px',
        background: isEmpty ? 'rgba(255,255,255,0.04)' : `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.4s',
      }}>
        <Icon size={16} color={isEmpty ? '#334155' : color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '10px', color: '#64748b', marginBottom: '2px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600,
          color: isEmpty ? '#334155' : (warning ? '#ef4444' : color),
          lineHeight: 1,
        }}>
          {isEmpty
            ? '--'
            : <>{value}<span style={{ fontSize: '11px', marginLeft: '3px', color: '#64748b', fontWeight: 400 }}>{unit}</span></>
          }
        </div>
      </div>
    </div>
  );
}

// ─── SVG Waveform ─────────────────────────────────────────────────────────────
// Stays flat (just the baseline) until real frames arrive.
function Waveform({ frames }) {
  const points = useMemo(() => {
    if (frames.length < 2) return null; // not enough data to draw a line
    const data = frames.slice(0, 30).map(f => f.data?.temperature_c ?? null).filter(v => v != null);
    if (data.length < 2) return null;
    const width = 400;
    const height = 40;
    const min = 20, max = 85; // realistic hardware temp range
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / (max - min)) * height;
      return `${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`;
    });
    return pts.join(' ');
  }, [frames]);

  return (
    <div style={{ width: '100%', height: '40px', overflow: 'hidden', position: 'relative' }}>
      <svg width="100%" height="40" viewBox="0 0 400 40" preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#00d4ff" stopOpacity="0" />
            <stop offset="30%"  stopColor="#00d4ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {/* baseline always visible */}
        <line x1="0" y1="39" x2="400" y2="39" stroke="rgba(0,212,255,0.1)" strokeWidth="1" />
        {/* waveform — only drawn when real data exists */}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="url(#waveGrad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}

// =============================================================================
export function TelemetryPanel({ frames, latestMetrics }) {
  const scrollRef = useRef(null);
  const metrics   = latestMetrics || {};
  const isLive    = frames.length > 0;

  // Scroll to newest (top) when frames arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [frames.length]);

  const tempWarning    = metrics.temperature_c    > 70;
  const voltageWarning = metrics.supply_voltage_v < 3.0;

  // Compute packet rate from last two frames (frames are newest-first)
  const pktRate = useMemo(() => {
    if (frames.length < 2) return null;
    const dtMs = new Date(frames[0].timestamp) - new Date(frames[1].timestamp);
    if (dtMs <= 0) return null;
    return (1000 / dtMs).toFixed(1);
  }, [frames]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>

      {/* Panel title + status badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={14} color="#00d4ff" />
          <span style={{
            fontSize: '11px', fontWeight: 600, color: '#00d4ff',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            Live Telemetry
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span className="blink" style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: '#10b981', display: 'block',
              }} />
              <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700, letterSpacing: '0.1em' }}>
                LIVE
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'var(--font-mono)' }}>
              WAITING
            </span>
          )}
          <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'var(--font-mono)' }}>
            {frames.length} frames
          </span>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <MetricCard
          icon={Thermometer}
          label="Core Temp"
          value={latestMetrics ? metrics.temperature_c?.toFixed(1) : null}
          unit="°C"
          color={tempWarning ? '#ef4444' : '#f59e0b'}
          warning={tempWarning}
        />
        <MetricCard
          icon={Zap}
          label="Supply V"
          value={latestMetrics ? metrics.supply_voltage_v?.toFixed(3) : null}
          unit="V"
          color={voltageWarning ? '#ef4444' : '#10b981'}
          warning={voltageWarning}
        />
        <MetricCard
          icon={Package}
          label="Packet ID"
          value={latestMetrics ? metrics.packet_id?.toLocaleString() : null}
          color="#a855f7"
        />
        <MetricCard
          icon={Clock}
          label="Pkt Rate"
          value={pktRate}
          unit="Hz"
          color="#00d4ff"
        />
      </div>

      {/* Waveform */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(0,212,255,0.08)',
        borderRadius: '8px',
        padding: '8px 10px',
      }}>
        <div style={{
          fontSize: '9px', color: '#334155', marginBottom: '4px',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
        }}>
          TEMPERATURE °C · LAST 30 FRAMES
          {!isLive && <span style={{ marginLeft: '8px', color: '#1e293b' }}>· NO DATA</span>}
        </div>
        <Waveform frames={frames} />
      </div>

      {/* Frame log */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          gap: '4px', minHeight: 0,
        }}
      >
        {frames.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '8px',
            color: '#1e293b', fontSize: '12px',
          }}>
            <Activity size={22} color="#1e293b" />
            <span>No telemetry — connect hardware to begin</span>
          </div>
        )}
        {frames.map((frame) => (
          <div
            key={frame.id}
            className="slide-in"
            style={{
              background: 'rgba(255,255,255,0.018)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '6px',
              padding: '7px 10px',
              display: 'flex', alignItems: 'center', gap: '12px',
              fontSize: '11px', flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', color: '#334155', width: '70px', flexShrink: 0 }}>
              {formatTime(frame.timestamp)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#00d4ff', width: '50px', flexShrink: 0 }}>
              #{frame.data?.packet_id?.toString().padStart(4, '0') ?? '????'}
            </span>
            <span style={{ color: '#94a3b8' }}>
              T:<span style={{ color: '#f59e0b' }}>{frame.data?.temperature_c?.toFixed(1)}°</span>
              {' '}V:<span style={{ color: '#10b981' }}>{frame.data?.supply_voltage_v?.toFixed(2)}</span>
              {' '}FPGA:<span style={{ color: frame.data?.fpga_config_done ? '#10b981' : '#ef4444' }}>
                {frame.data?.fpga_config_done ? 'RDY' : 'CFG'}
              </span>
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <RSSIIndicator rssiDbm={frame.data?.rssi_dbm} showLabel={false} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
