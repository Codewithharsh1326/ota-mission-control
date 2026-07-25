/**
 * HardwareStatus.jsx
 * ─────────────────────────────────────────────────────────────────
 * Displays live connection status for the hardware edge nodes:
 *   • ESP32-S3 Nano   — primary OTA node, WebSocket source
 *   • Shrike-lite     — MPSoC board: RP2040 + FPGA on a single die
 *                       RP2040 acts as the I²C/SPI configuration bridge;
 *                       FPGA is the bitstream target, configured by RP2040.
 *
 * Receives latestMetrics from useTelemetry to populate live fields.
 */

import { Cpu, Activity, Radio } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { RSSIIndicator } from './RSSIIndicator';
import { formatUptime } from '../utils/formatters';

// --- Individual hardware node card ---
function NodeCard({ title, subtitle, icon: Icon, status, children, glowColor = '#10b981' }) {
  const isConnected = status === 'Connected';
  const isConnecting = status === 'Connecting';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${isConnected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '10px',
        padding: '14px',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        transition: 'border-color 0.5s ease',
      }}
      className={isConnected ? 'breathe-glow' : isConnecting ? 'amber-breathe' : ''}
    >
      {/* Scan line for connected state */}
      {isConnected && <div className="scan-line" />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: isConnected ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.4s',
          }}>
            <Icon size={16} color={isConnected ? '#10b981' : '#475569'} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{title}</div>
            <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>{subtitle}</div>
          </div>
        </div>
        <StatusBadge status={status} pulse={isConnected} />
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {children}
      </div>
    </div>
  );
}

// --- Row inside a card ---
function MetricRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
      <span style={{
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: valueColor || '#94a3b8',
        fontWeight: 500,
      }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// =============================================================================
export function HardwareStatus({ wsStatus, latestMetrics, esp32Online }) {
  const metrics = latestMetrics || {};

  // ── ESP32-S3 Nano: driven by broker hw_connection events ──────────────────
  // wsStatus = browser↔broker link; esp32Online = physical ESP32↔broker link
  const esp32Status = esp32Online ? 'Connected' :
                      wsStatus === 'connecting' ? 'Connecting' : 'Disconnected';

  // ── Shrike-lite MPSoC: driven by rp2040_heartbeat field in telemetry ──────
  // rp2040_heartbeat: true  → RP2040 UART link is alive
  // rp2040_heartbeat: false → RP2040 UART link degraded / timed out
  // shrike_link: 'UP'/'DEGRADED' used as fallback if heartbeat field absent
  const shrikeStatus =
    !esp32Online ? 'Disconnected' :        // ESP32 offline → downstream is offline
    metrics.rp2040_heartbeat === true  ? 'Connected' :
    metrics.rp2040_heartbeat === false ? 'Halted' :
    metrics.shrike_link === 'UP'       ? 'Connected' :
    metrics.shrike_link === 'DEGRADED' ? 'Halted' :
    latestMetrics ? 'Halted' : 'Disconnected';

  // FPGA config state color — shown inside the Shrike-lite card
  const fpgaStateColor = {
    'IDLE':        '#64748b',
    'CONFIGURE':   '#f59e0b',
    'USER_MODE':   '#10b981',
    'RECONFIGURE': '#a855f7',
  }[metrics.fpga_state] || '#94a3b8';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>

      {/* Panel title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
        <Radio size={14} color="#00d4ff" />
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#00d4ff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Hardware Status
        </span>
      </div>

      {/* ESP32-S3 Card */}
      <NodeCard
        title="ESP32-S3 Nano"
        subtitle="Primary OTA Node · WebSocket"
        icon={Cpu}
        status={esp32Status}
      >
        <MetricRow label="Uptime" value={formatUptime(metrics.uptime_s)} />
        <MetricRow
          label="Core Temp"
          value={metrics.temperature_c != null ? `${metrics.temperature_c}°C` : null}
          valueColor={metrics.temperature_c > 45 ? '#ef4444' : metrics.temperature_c > 38 ? '#f59e0b' : '#10b981'}
        />
        <MetricRow
          label="Supply Voltage"
          value={metrics.supply_voltage_v != null ? `${metrics.supply_voltage_v}V` : null}
          valueColor={metrics.supply_voltage_v < 3.1 ? '#ef4444' : '#10b981'}
        />
        {/* RSSI */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Wi-Fi RSSI</span>
          <RSSIIndicator rssiDbm={metrics.rssi_dbm} showLabel={true} />
        </div>
      </NodeCard>

      {/* ── Shrike-lite MPSoC Card (RP2040 + FPGA on one board) ── */}
      <NodeCard
        title="Shrike-lite"
        subtitle="MPSoC · RP2040 + FPGA · OTA Flash Target"
        icon={Activity}
        status={shrikeStatus}
      >
        {/* RP2040 section */}
        <div style={{
          fontSize: '9px', fontWeight: 700, color: '#334155',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px',
        }}>
          RP2040 — Config Bridge
        </div>
        <MetricRow
          label="SPI/I²C Link"
          value={metrics.shrike_link || '—'}
          valueColor={metrics.shrike_link === 'UP' ? '#10b981' : metrics.shrike_link === 'DEGRADED' ? '#f59e0b' : '#64748b'}
        />
        <MetricRow label="Packets Rx" value={metrics.packet_id?.toLocaleString()} />

        {/* Divider */}
        <div style={{
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          margin: '4px 0',
        }} />

        {/* FPGA section */}
        <div style={{
          fontSize: '9px', fontWeight: 700, color: '#334155',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px',
        }}>
          FPGA — Bitstream Target
        </div>
        <MetricRow
          label="Config"
          value={metrics.fpga_config_done != null
            ? (metrics.fpga_config_done ? 'DONE' : 'PENDING')
            : '—'}
          valueColor={metrics.fpga_config_done ? '#10b981' : '#f59e0b'}
        />
        <MetricRow
          label="State"
          value={metrics.fpga_state || '—'}
          valueColor={fpgaStateColor}
        />
      </NodeCard>
    </div>
  );
}
