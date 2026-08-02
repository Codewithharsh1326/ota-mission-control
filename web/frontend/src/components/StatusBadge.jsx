/**
 * StatusBadge.jsx
 * ─────────────────────────────────────────────────────────────────
 * Reusable status pill component used across all panels.
 * Supports: Success, Halted, Resumed, Failed, Ready, Uploading,
 *           Connected, Disconnected, Connecting, Error
 */

const STATUS_CONFIG = {
  Success:      { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#10b981', dot: '#10b981' },
  Ready:        { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',  text: '#6ee7b7', dot: '#10b981' },
  Halted:       { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  text: '#f59e0b', dot: '#f59e0b' },
  Resumed:      { bg: 'rgba(0,212,255,0.12)',   border: 'rgba(0,212,255,0.4)',   text: '#00d4ff', dot: '#00d4ff' },
  Failed:       { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',   text: '#ef4444', dot: '#ef4444' },
  Uploaded:     { bg: 'rgba(0,212,255,0.12)',   border: 'rgba(0,212,255,0.4)',   text: '#00d4ff', dot: '#00d4ff' },
  Uploading:    { bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.4)',  text: '#a855f7', dot: '#a855f7' },
  Connected:         { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#10b981', dot: '#10b981' },
  Disconnected:      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)', text: '#f87171', dot: '#ef4444' },
  Connecting:        { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)', text: '#fbbf24', dot: '#f59e0b' },
  Error:             { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',  text: '#ef4444', dot: '#ef4444' },
  DEGRADED:          { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  text: '#f59e0b', dot: '#f59e0b' },
  UP:                { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#10b981', dot: '#10b981' },
  DEMO:              { bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  text: '#c084fc', dot: '#a855f7' },
  'Ready to Flash':  { bg: 'rgba(0,212,255,0.12)',   border: 'rgba(0,212,255,0.4)',   text: '#00d4ff', dot: '#10b981' },
  'Awaiting Hardware': { bg: 'rgba(100,116,139,0.12)', border: 'rgba(245,158,11,0.25)', text: '#94a3b8', dot: '#f59e0b' },
};

const DEFAULT_CONFIG = { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)', text: '#94a3b8', dot: '#f1f5f9' };

export function StatusBadge({ status, pulse = false, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || DEFAULT_CONFIG;
  const fontSize = size === 'xs' ? '10px' : size === 'sm' ? '11px' : '12px';
  const px = size === 'xs' ? '6px' : '8px';
  const py = size === 'xs' ? '2px' : '3px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        borderRadius: '20px',
        fontSize,
        fontWeight: 600,
        padding: `${py} ${px}`,
        letterSpacing: '0.04em',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
        }}
        className={pulse ? 'blink' : ''}
      />
      {status}
    </span>
  );
}
