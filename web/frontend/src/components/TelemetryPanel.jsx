/**
 * TelemetryPanel.jsx
 * ─────────────────────────────────────────────────────────────────
 * Displays live telemetry streamed from the hardware via WebSocket.
 *
 * Features:
 *  • Multi-axis line chart for Core Temp, Supply Voltage, and Packet Rate.
 *  • LIVE badge (blink dot) only shown when real frames are arriving.
 */

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { formatTimeShort } from '../utils/formatters';

// =============================================================================
export function TelemetryPanel({ frames }) {
  const isLive = frames.length > 0;

  // Compute chart data (oldest to newest)
  const chartData = useMemo(() => {
    if (frames.length < 2) return [];

    // frames is newest-first, so we reverse it to plot left-to-right (oldest -> newest)
    const reversedFrames = [...frames].reverse();

    return reversedFrames.map((frame, index) => {
      // Calculate packet rate (Hz) using the previous frame in the reversed array (chronologically older)
      let rate = null;
      if (index > 0) {
        const prevFrame = reversedFrames[index - 1];
        const dtMs = new Date(frame.timestamp) - new Date(prevFrame.timestamp);
        if (dtMs > 0) {
          rate = parseFloat((1000 / dtMs).toFixed(1));
        }
      }

      return {
        time: formatTimeShort(frame.timestamp),
        temp: frame.data?.temperature_c ? parseFloat(frame.data.temperature_c.toFixed(1)) : null,
        rssi: frame.data?.rssi_dbm ? parseInt(frame.data.rssi_dbm, 10) : null,
        rate: rate
      };
    });
  }, [frames]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '15px' }}>

      {/* Panel title + status badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
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
            <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              WAITING
            </span>
          )}
          <span style={{ fontSize: '10px', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
            {frames.length} frames
          </span>
        </div>
      </div>

      {/* Main Chart Area */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!isLive ? (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '8px', color: '#f1f5f9', fontSize: '12px'
          }}>
            <Activity size={24} />
            <span>No telemetry — connect hardware to begin</span>
          </div>
        ) : (
          <>
            {/* Core Temp Chart */}
            <div style={{ flex: 1, minHeight: 0, background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '5px' }}>
              <div style={{ fontSize: '10px', color: '#f59e0b', fontFamily: 'var(--font-mono)', paddingLeft: '20px' }}>CORE TEMP (°C)</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#f59e0b', fontSize: 10, fontFamily: 'var(--font-mono)' }} stroke="none" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(13,17,23,0.85)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(12px)', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* RSSI Chart */}
            <div style={{ flex: 1, minHeight: 0, background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '5px' }}>
              <div style={{ fontSize: '10px', color: '#10b981', fontFamily: 'var(--font-mono)', paddingLeft: '20px' }}>Wi-Fi RSSI (dBm)</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#10b981', fontSize: 10, fontFamily: 'var(--font-mono)' }} stroke="none" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(13,17,23,0.85)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(12px)', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="rssi" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Packet Rate Chart */}
            <div style={{ flex: 1, minHeight: 0, background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '5px' }}>
              <div style={{ fontSize: '10px', color: '#00d4ff', fontFamily: 'var(--font-mono)', paddingLeft: '20px' }}>PACKET RATE (Hz)</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#cbd5e1" fontSize={10} tickMargin={10} tick={{ fill: '#f1f5f9', fontFamily: 'var(--font-mono)' }} />
                  <YAxis domain={[0, 'auto']} tick={{ fill: '#00d4ff', fontSize: 10, fontFamily: 'var(--font-mono)' }} stroke="none" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(13,17,23,0.85)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(12px)', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="rate" stroke="#00d4ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
