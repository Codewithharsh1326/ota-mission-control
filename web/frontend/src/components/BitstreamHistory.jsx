/**
 * BitstreamHistory.jsx  (renamed concept: "Available Bitstreams")
 * ─────────────────────────────────────────────────────────────────
 * STEP 2 of 2 in the OTA flash pipeline.
 *
 * This panel shows all bitstreams already stored on the server in the
 * uploads/ directory. The user selects ONE file via a radio button,
 * then clicks "Flash to ESP32" to dispatch a flash_command to the
 * connected hardware node.
 *
 * ┌───────────────────────────────────────────────────────────────┐
 * │  STEP 1: Upload to Server  (OTAUploadZone.jsx)                │
 * │  STEP 2: Select & Flash    (this component)                   │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Flash flow:
 *   user selects file → clicks "Flash to ESP32"
 *   → POST /api/flash?filename=<file>
 *   → broker forwards flash_command over /ws/hardware to ESP32
 *   → ESP32 begins flashing FPGA bitstream
 *
 * Status badge (hardware-aware):
 *   ESP32 online  → "Ready to Flash" (cyan)
 *   ESP32 offline → "Awaiting Hardware" (amber)
 */

import { useState, useEffect, useCallback } from 'react';
import { Layers, RefreshCw, HardDrive, Zap, Radio } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { API_BASE_URL } from '../config';

const POLL_INTERVAL_MS = 5000;

// ─── Table header cell ────────────────────────────────────────────────────────
function TH({ children, width, align = 'left' }) {
  return (
    <th style={{
      width,
      padding: '8px 10px',
      textAlign: align,
      fontSize: '10px',
      fontWeight: 600,
      color: '#cbd5e1',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      whiteSpace: 'nowrap',
      background: '#0d1117',
      position: 'sticky',
      top: 0,
      zIndex: 1,
    }}>
      {children}
    </th>
  );
}

// ─── Table data cell ──────────────────────────────────────────────────────────
function TD({ children, mono = false, align = 'left', muted = false }) {
  return (
    <td style={{
      padding: '8px 10px',
      textAlign: align,
      fontSize: '11px',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
      color: muted ? '#94a3b8' : '#94a3b8',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '180px',
    }}>
      {children}
    </td>
  );
}

// =============================================================================
export function BitstreamHistory({ refreshTrigger, esp32Online, onSelectFile, onTabChange }) {
  const [history, setHistory]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [lastFetch, setLastFetch]       = useState(null);
  const [selectedFile, setSelectedFile] = useState(null); // filename string
  const [sourceTab, setSourceTab]       = useState('uploads'); // 'uploads' | 'precompiled'
  const [flashState, setFlashState]     = useState('idle'); // idle | sending | success | error
  const [flashMsg, setFlashMsg]         = useState('');

  // ── Fetch list of server-side bitstreams ──────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history?source=${sourceTab}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        setLastFetch(new Date());
        // If selected file was deleted by recycle bin, deselect it
        if (selectedFile && !data.find(f => f.filename === selectedFile)) {
          setSelectedFile(null);
          onSelectFile?.(null);
        }
      }
    } catch (e) {
      console.warn('Bitstream list fetch failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedFile, sourceTab]);

  // Polling + refresh on upload
  useEffect(() => {
    fetchHistory();
    const timer = setInterval(fetchHistory, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchHistory]);

  useEffect(() => {
    if (refreshTrigger) fetchHistory();
  }, [refreshTrigger, fetchHistory]);

  // ── Flash dispatch: POST /api/flash?filename=... ───────────────────────────
  const handleFlash = async () => {
    if (!selectedFile || !esp32Online || flashState === 'sending') return;

    setFlashState('sending');
    setFlashMsg('');

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/flash?filename=${encodeURIComponent(selectedFile)}&source=${sourceTab}`,
        { method: 'POST' }
      );
      const data = await res.json();

      if (res.ok) {
        setFlashState('success');
        setFlashMsg(`Dispatched to ${data.hardware_targets} node(s)`);
        setTimeout(() => setFlashState('idle'), 4000);
      } else {
        setFlashState('error');
        setFlashMsg(data.detail || 'Flash failed');
        setTimeout(() => setFlashState('idle'), 5000);
      }
    } catch (e) {
      setFlashState('error');
      setFlashMsg('Network error — is the backend running?');
      setTimeout(() => setFlashState('idle'), 5000);
    }
  };

  // ── Derived button state ───────────────────────────────────────────────────
  const canFlash    = esp32Online && !!selectedFile && flashState === 'idle';
  const flashLabel  = flashState === 'sending' ? 'Sending…'
                    : flashState === 'success' ? 'Dispatched ✓'
                    : flashState === 'error'   ? 'Failed ✗'
                    : 'Flash to Shrike';
  const flashColor  = flashState === 'success' ? '#10b981'
                    : flashState === 'error'   ? '#ef4444'
                    : canFlash                 ? '#00d4ff'
                    : '#94a3b8';
  const flashBg     = flashState === 'success' ? 'rgba(16,185,129,0.12)'
                    : flashState === 'error'   ? 'rgba(239,68,68,0.12)'
                    : canFlash                 ? 'rgba(0,212,255,0.1)'
                    : 'rgba(255,255,255,0.03)';
  const flashBorder = flashState === 'success' ? 'rgba(16,185,129,0.4)'
                    : flashState === 'error'   ? 'rgba(239,68,68,0.4)'
                    : canFlash                 ? 'rgba(0,212,255,0.35)'
                    : 'rgba(255,255,255,0.06)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '8px', flexShrink: 0,
      }}>
        {/* Title + STEP 2 badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={14} color="#a855f7" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#a855f7', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Available Bitstreams
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#94a3b8',
            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: '20px', padding: '1px 7px', letterSpacing: '0.08em',
          }}>
            STEP 2 OF 2
          </span>
          <span style={{
            fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)',
            background: 'rgba(255,255,255,0.04)', padding: '2px 7px', borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {history.length} files
          </span>
        </div>

        {/* Controls: last updated + refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lastFetch && (
            <span style={{ fontSize: '10px', color: '#1e293b', fontFamily: 'var(--font-mono)' }}>
              {lastFetch.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          )}
          <button
            onClick={fetchHistory}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              padding: '3px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Source Toggle ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '8px',
        padding: '2px',
        marginBottom: '10px',
        border: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {['uploads', 'precompiled'].map(tab => (
          <div
            key={tab}
            onClick={() => { 
              setSourceTab(tab); 
              setSelectedFile(null); 
              onTabChange?.(tab);
              onSelectFile?.(null);
            }}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px 0',
              fontSize: '11px',
              fontWeight: 600,
              color: sourceTab === tab ? '#fff' : '#94a3b8',
              background: sourceTab === tab ? 'rgba(168,85,247,0.3)' : 'transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: sourceTab === tab ? '1px solid rgba(168,85,247,0.5)' : '1px solid transparent',
              letterSpacing: '0.05em',
            }}
          >
            {tab === 'uploads' ? 'Uploaded Files' : 'Precompiled files'}
          </div>
        ))}
      </div>

      {/* ── Flash action bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px',
        background: 'rgba(168,85,247,0.04)',
        border: '1px solid rgba(168,85,247,0.12)',
        borderRadius: '8px', flexShrink: 0,
        marginBottom: '8px',
      }}>
        <Radio size={12} color={esp32Online ? '#10b981' : '#94a3b8'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedFile ? (
            <span style={{
              fontSize: '11px', fontFamily: 'var(--font-mono)',
              color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', display: 'block',
            }}>
              {selectedFile}
            </span>
          ) : (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Select a bitstream below to flash
            </span>
          )}
          {flashMsg && (
            <span style={{
              fontSize: '10px', fontFamily: 'var(--font-mono)',
              color: flashState === 'success' ? '#10b981' : '#ef4444',
              display: 'block', marginTop: '2px',
            }}>
              {flashMsg}
            </span>
          )}
        </div>

        {/* Flash button */}
        <button
          onClick={handleFlash}
          disabled={!canFlash}
          style={{
            background: flashBg,
            border: `1px solid ${flashBorder}`,
            color: flashColor,
            padding: '6px 14px',
            borderRadius: '8px',
            cursor: canFlash ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', fontWeight: 700,
            fontFamily: 'var(--font-ui)',
            letterSpacing: '0.05em',
            transition: 'all 0.25s',
            opacity: canFlash ? 1 : 0.4,
            flexShrink: 0,
          }}
        >
          <Zap size={12} />
          {flashLabel}
        </button>
      </div>

      {/* ── Bitstream table ───────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.05)',
        minHeight: 0,
      }}>
        {history.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '10px',
            color: '#94a3b8', padding: '20px',
          }}>
            <HardDrive size={28} color="#1e293b" />
            <span style={{ fontSize: '12px' }}>
              {loading ? 'Loading bitstreams…' : 'No bitstreams on server — upload one first (Step 1)'}
            </span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <TH width="34px" align="center">⬤</TH>
                <TH width="30%">Filename</TH>
                <TH width="10%" align="right">Size</TH>
                <TH width="18%">Uploaded At</TH>
                <TH width="16%" align="center">Status</TH>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => {
                const isSelected = selectedFile === entry.filename;
                return (
                  <tr
                    key={`${entry.filename}-${idx}`}
                    onClick={() => {
                      setSelectedFile(entry.filename);
                      onSelectFile?.(entry.filename);
                    }}
                    style={{
                      cursor: 'pointer',
                      background: isSelected
                        ? 'rgba(168,85,247,0.08)'
                        : 'transparent',
                      transition: 'background 0.15s',
                      outline: isSelected ? '1px solid rgba(168,85,247,0.25)' : 'none',
                      outlineOffset: '-1px',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Radio select column */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '13px', height: '13px',
                        borderRadius: '50%',
                        border: `2px solid ${isSelected ? '#a855f7' : 'rgba(255,255,255,0.15)'}`,
                        background: isSelected ? '#a855f7' : 'transparent',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 0 8px rgba(168,85,247,0.6)' : 'none',
                      }} />
                    </td>

                    <TD mono>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <HardDrive size={11} color={isSelected ? '#a855f7' : '#94a3b8'} style={{ flexShrink: 0 }} />
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: isSelected ? '#e2e8f0' : '#cbd5e1',
                        }}>
                          {entry.filename}
                        </span>
                      </div>
                    </TD>

                    <TD mono align="right">{formatBytes(entry.size)}</TD>
                    <TD mono muted>{entry.timestamp}</TD>

                    <TD align="center">
                      <StatusBadge
                        status={esp32Online ? 'Ready to Flash' : 'Awaiting Hardware'}
                        size="xs"
                        pulse={esp32Online && isSelected}
                      />
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Hardware offline warning ─────────────────────────────────────── */}
      {!esp32Online && (
        <div style={{
          marginTop: '6px', padding: '5px 10px',
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.15)',
          borderRadius: '6px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Radio size={11} color="#f59e0b" />
          <span style={{ fontSize: '10px', color: '#92400e', fontFamily: 'var(--font-mono)' }}>
            ESP32 offline — connect hardware to enable flashing
          </span>
        </div>
      )}
    </div>
  );
}
