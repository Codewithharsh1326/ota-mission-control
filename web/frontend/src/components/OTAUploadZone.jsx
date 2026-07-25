/**
 * OTAUploadZone.jsx
 * ─────────────────────────────────────────────────────────────────
 * Drag-and-drop file upload component for .bit and .bin bitstreams.
 *
 * Features:
 *  • Drag-and-drop with visual state transitions
 *  • File type validation (.bit / .bin only)
 *  • Animated upload progress bar
 *  • Duration tracking
 *  • Success/failure states with animated feedback
 *  • Sends multipart/form-data POST to /upload
 */

import { useState, useRef, useCallback } from 'react';
import { Upload, File, CheckCircle, XCircle, Loader, CloudUpload } from 'lucide-react';
import { formatBytes, formatDuration } from '../utils/formatters';
import { API_BASE_URL } from '../config';

const ALLOWED_EXTS = ['.bit', '.bin'];

function validateFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return `Invalid type "${ext}". Only .bit and .bin are accepted.`;
  }
  return null;
}

export function OTAUploadZone({ onUploadComplete }) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadState, setUploadState] = useState('idle'); // idle | uploading | success | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const xhrRef = useRef(null);

  const reset = () => {
    setSelectedFile(null);
    setUploadState('idle');
    setProgress(0);
    setErrorMsg('');
    setResult(null);
  };

  const handleFile = useCallback((file) => {
    const err = validateFile(file);
    if (err) {
      setErrorMsg(err);
      setUploadState('error');
      return;
    }
    setSelectedFile(file);
    setUploadState('idle');
    setErrorMsg('');
    setResult(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleUpload = () => {
    if (!selectedFile || uploadState === 'uploading') return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    const startTime = Date.now();
    setUploadState('uploading');
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        const duration = Date.now() - startTime;
        setResult({ ...data, duration_ms: duration });
        setUploadState('success');
        setProgress(100);
        if (onUploadComplete) onUploadComplete({ ...data, duration_ms: duration });
      } else {
        setErrorMsg(`Server error: ${xhr.status}`);
        setUploadState('error');
      }
    };

    xhr.onerror = () => {
      setErrorMsg('Network error — is the backend running?');
      setUploadState('error');
    };

    xhr.open('POST', `${API_BASE_URL}/upload`);
    xhr.send(formData);
  };

  const cancelUpload = () => {
    xhrRef.current?.abort();
    reset();
  };

  // --- Derived visual state ---
  const borderColor = dragOver
    ? 'rgba(0,212,255,0.7)'
    : uploadState === 'success'
    ? 'rgba(16,185,129,0.5)'
    : uploadState === 'error'
    ? 'rgba(239,68,68,0.5)'
    : 'rgba(0,212,255,0.2)';

  const bgColor = dragOver
    ? 'rgba(0,212,255,0.06)'
    : uploadState === 'success'
    ? 'rgba(16,185,129,0.05)'
    : uploadState === 'error'
    ? 'rgba(239,68,68,0.05)'
    : 'rgba(0,0,0,0.15)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>

      {/* Panel title — STEP 1 of 2 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CloudUpload size={14} color="#00d4ff" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#00d4ff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Upload to Server
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#334155',
            background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: '20px', padding: '1px 7px', letterSpacing: '0.08em',
          }}>
            STEP 1 OF 2
          </span>
        </div>
        <span style={{ fontSize: '10px', color: '#334155', fontFamily: 'var(--font-mono)' }}>
          Accepts .bit · .bin
        </span>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => uploadState === 'idle' && inputRef.current?.click()}
        className={!selectedFile && uploadState === 'idle' ? 'dropzone-idle' : ''}
        style={{
          flex: 1,
          border: `2px dashed ${borderColor}`,
          borderRadius: '10px',
          background: bgColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: uploadState === 'idle' ? 'pointer' : 'default',
          transition: 'all 0.3s ease',
          position: 'relative',
          overflow: 'hidden',
          padding: '16px',
          gap: '10px',
          minHeight: 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".bit,.bin"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />

        {/* === IDLE STATE === */}
        {uploadState === 'idle' && !selectedFile && (
          <>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: 'rgba(0,212,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={22} color="#00d4ff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>
                {dragOver ? 'Drop to load bitstream' : 'Drag & drop bitstream here'}
              </div>
              <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px' }}>
                or click to browse · .bit or .bin only
              </div>
            </div>
          </>
        )}

        {/* === FILE SELECTED === */}
        {uploadState === 'idle' && selectedFile && (
          <>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'rgba(0,212,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <File size={20} color="#00d4ff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                {formatBytes(selectedFile.size)} · Ready to flash
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                style={{
                  background: 'rgba(0,212,255,0.15)',
                  border: '1px solid rgba(0,212,255,0.4)',
                  color: '#00d4ff',
                  padding: '7px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-ui)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.15)'; }}
              >
                Upload to Server
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#475569',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Clear
              </button>
            </div>
          </>
        )}

        {/* === UPLOADING STATE === */}
        {uploadState === 'uploading' && (
          <>
            <div className="spin" style={{
              width: '44px', height: '44px', borderRadius: '12px',
              border: '2px solid rgba(0,212,255,0.2)',
              borderTop: '2px solid #00d4ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Uploading bitstream...</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#00d4ff', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {progress}%
              </div>
            </div>
            {/* Progress bar */}
            <div style={{
              width: '80%', height: '4px', background: 'rgba(0,212,255,0.1)',
              borderRadius: '2px', overflow: 'hidden',
            }}>
              <div
                className="shimmer"
                style={{
                  height: '100%', width: `${progress}%`,
                  background: '#00d4ff',
                  borderRadius: '2px',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); cancelUpload(); }}
              style={{
                background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', padding: '5px 14px', borderRadius: '6px',
                cursor: 'pointer', fontSize: '11px',
              }}
            >
              Cancel
            </button>
          </>
        )}

        {/* === SUCCESS STATE === */}
        {uploadState === 'success' && result && (
          <>
            <CheckCircle size={36} color="#10b981" className="fade-in" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>Bitstream Uploaded</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {result.original_name} · {formatBytes(result.size)} · {formatDuration(result.duration_ms)}
              </div>
              <div style={{ fontSize: '10px', color: '#334155', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                Saved → {result.path}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: '#10b981', padding: '6px 16px', borderRadius: '8px',
                cursor: 'pointer', fontSize: '12px',
              }}
            >
              Upload Another
            </button>
          </>
        )}

        {/* === ERROR STATE === */}
        {uploadState === 'error' && (
          <>
            <XCircle size={36} color="#ef4444" className="fade-in" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>Upload Failed</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{errorMsg}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', padding: '6px 16px', borderRadius: '8px',
                cursor: 'pointer', fontSize: '12px',
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
