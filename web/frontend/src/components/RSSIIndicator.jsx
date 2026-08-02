/**
 * RSSIIndicator.jsx
 * ─────────────────────────────────────────────────────────────────
 * Visual Wi-Fi signal strength indicator.
 * Renders 5 animated bars that fill based on RSSI dBm value.
 * Optionally shows the numeric dBm value.
 */

import { rssiToBars, rssiToColor } from '../utils/formatters';

export function RSSIIndicator({ rssiDbm, showLabel = true }) {
  const bars = rssiToBars(rssiDbm);
  const color = rssiToColor(bars);
  const totalBars = 5;

  const barHeights = [30, 45, 60, 75, 100]; // percent of container height

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '20px' }}>
      {Array.from({ length: totalBars }, (_, i) => {
        const active = i < bars;
        return (
          <div
            key={i}
            style={{
              width: '4px',
              height: `${barHeights[i]}%`,
              borderRadius: '2px',
              background: active ? color : 'rgba(255,255,255,0.1)',
              transition: 'background 0.4s ease',
              boxShadow: active ? `0 0 4px ${color}88` : 'none',
            }}
          />
        );
      })}
      {showLabel && rssiDbm != null && (
        <span
          style={{
            marginLeft: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: color,
            lineHeight: 1,
            alignSelf: 'center',
          }}
        >
          {rssiDbm} dBm
        </span>
      )}
      {(rssiDbm == null) && (
        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
          N/A
        </span>
      )}
    </div>
  );
}
