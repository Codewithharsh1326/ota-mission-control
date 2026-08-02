import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Copy, Check } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function DocumentationPanel({ style, selectedBitstream, historySourceTab }) {
  const [examples, setExamples] = useState([]);
  const [selectedExample, setSelectedExample] = useState(null);
  const [selectedView, setSelectedView] = useState('README.md'); // 'README.md' or filename
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Fetch examples on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/examples`)
      .then(res => res.json())
      .then(data => {
        setExamples(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load examples docs:", err);
        setLoading(false);
      });
  }, []);

  // Sync selectedExample with the selectedBitstream from BitstreamHistory
  useEffect(() => {
    if (!selectedBitstream || historySourceTab !== 'precompiled') {
      setSelectedExample(null);
      return;
    }
    const folderName = selectedBitstream.split('/')[0];
    const found = examples.find(e => e.name === folderName);
    setSelectedExample(found || null);
  }, [selectedBitstream, historySourceTab, examples]);

  // When example changes, reset view to README
  useEffect(() => {
    setSelectedView('README.md');
    setCopied(false);
  }, [selectedExample]);

  const handleCopy = (content) => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = () => {
    if (!selectedExample) return null;

    if (selectedView === 'README.md') {
      const renderImage = ({ src, alt, ...props }) => {
        let finalSrc = src;
        // If it's a relative URL, prepend the backend API base path
        if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
          finalSrc = `${API_BASE_URL}/api/static/examples/${selectedExample.name}/${src}`;
        }
        return <img src={finalSrc} alt={alt} {...props} style={{ maxWidth: '100%', borderRadius: '8px' }} />;
      };

      return (
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{ img: renderImage }}
        >
          {selectedExample.readme || "*No README.md found for this example.*"}
        </ReactMarkdown>
      );
    }

    // Find the code file
    const codeFile = selectedExample.files.find(f => f.name === selectedView);
    if (codeFile && codeFile.content) {
      const lang = selectedView.endsWith('.py') ? 'python' : 'cpp';
      return (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => handleCopy(codeFile.content)}
            title="Copy Code"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: copied ? '#10b981' : '#cbd5e1',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              zIndex: 10
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <SyntaxHighlighter
            language={lang}
            style={vscDarkPlus}
            customStyle={{ background: 'transparent', margin: 0, padding: 0 }}
            showLineNumbers={true}
          >
            {codeFile.content}
          </SyntaxHighlighter>
        </div>
      );
    }

    return <div style={{ color: '#94a3b8' }}>Preview not available for this file.</div>;
  };

  // Build tabs: always README first, then code files (.py, .ino)
  const getTabs = () => {
    if (!selectedExample) return [];
    const tabs = ['README.md'];
    selectedExample.files.forEach(f => {
      if (f.content !== null) { // Code files have content
        tabs.push(f.name);
      }
    });
    return tabs;
  };

  const tabs = getTabs();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', gap: '10px',
      background: 'rgba(13,17,23,0.35)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '16px',
      padding: '14px',
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      overflow: 'hidden',
      ...style
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BookOpen size={14} color="#00d4ff" />
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#00d4ff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Examples Documentation
        </span>
      </div>

      {/* Markdown / Code Content Area */}
      <div style={{
        flex: 1,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '10px',
        padding: '20px',
        overflowY: 'auto',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }} className="markdown-body custom-scrollbar">
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading docs...</div>
        ) : selectedExample ? (
          <>
            {/* View Toggle (Sliding Tabs) */}
            {tabs.length > 1 && (
              <div style={{ 
                display: 'flex', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '8px',
                padding: '4px',
                marginBottom: '20px',
                width: 'fit-content'
              }}>
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSelectedView(tab)}
                    style={{
                      background: selectedView === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: selectedView === tab ? '#e2e8f0' : '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 16px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontWeight: selectedView === tab ? 600 : 400
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {/* Display non-code files (like .bin) as info chips */}
            {selectedView === 'README.md' && selectedExample.files.filter(f => f.content === null).length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {selectedExample.files.filter(f => f.content === null).map(f => (
                  <span key={f.name} style={{
                    fontSize: '10px',
                    background: 'rgba(168,85,247,0.1)',
                    color: '#a855f7',
                    border: '1px solid rgba(168,85,247,0.3)',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {f.name} (Ready to Flash)
                  </span>
                ))}
              </div>
            )}

            {/* Actual Content */}
            <div style={{ flex: 1 }}>
              {renderContent()}
            </div>
          </>
        ) : (
          <div style={{ 
            color: '#94a3b8', 
            fontSize: '13px', 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            Select a file in the Precompiled Files list below<br/>to view its documentation.
          </div>
        )}
      </div>
    </div>
  );
}
