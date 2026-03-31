import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon } from '../shared/Icons';
import {
  fetchPapers,
  fetchAttachments,
  exportReferences,
  type NavigatePaper,
  type ScribeAttachment,
} from '../../lib/references-api';
import * as api from '../../lib/api';

type SourceTab = 'All' | 'Papers' | 'Books';

function parseAuthors(json: string): string {
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      if (arr.length <= 2) return arr.join(', ');
      return `${arr[0]} et al.`;
    }
  } catch {}
  return json;
}

export default function ReferenceBrowser() {
  const [tab, setTab] = useState<SourceTab>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [papers, setPapers] = useState<NavigatePaper[]>([]);
  const [attachments, setAttachments] = useState<ScribeAttachment[]>([]);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [pRes, aRes] = await Promise.all([fetchPapers(), fetchAttachments()]);
      if (cancelled) return;
      setPapers(pRes.papers);
      setPapersError(pRes.error ?? null);
      setAttachments(aRes.attachments);
      setAttachmentsError(aRes.error ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const query = search.toLowerCase();

  const filteredPapers = useMemo(() => {
    if (tab === 'Books') return [];
    return papers.filter((p) => {
      if (!query) return true;
      return (
        p.title.toLowerCase().includes(query) ||
        parseAuthors(p.authors).toLowerCase().includes(query)
      );
    });
  }, [papers, tab, query]);

  const filteredAttachments = useMemo(() => {
    if (tab === 'Papers') return [];
    return attachments.filter((a) => {
      if (!query) return true;
      return (
        a.filename.toLowerCase().includes(query) ||
        (a.subject && a.subject.toLowerCase().includes(query))
      );
    });
  }, [attachments, tab, query]);

  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    for (const p of filteredPapers) keys.push(`p:${p.id}`);
    for (const a of filteredAttachments) keys.push(`a:${a.id}`);
    return keys;
  }, [filteredPapers, filteredAttachments]);

  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));

  const toggleOne = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of visibleKeys) next.delete(k);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of visibleKeys) next.add(k);
        return next;
      });
    }
  }, [allVisibleSelected, visibleKeys]);

  const handleExport = useCallback(async () => {
    if (selected.size === 0) return;
    setExporting(true);
    setExportMsg(null);

    const paperIds: number[] = [];
    const attachmentIds: string[] = [];
    for (const key of selected) {
      if (key.startsWith('p:')) paperIds.push(Number(key.slice(2)));
      else if (key.startsWith('a:')) attachmentIds.push(key.slice(2));
    }

    const result = await exportReferences(paperIds, attachmentIds);
    setExporting(false);

    if (result.success) {
      setExportMsg(`Exported ${result.count} references to ${result.filename}`);
      // Refresh file tree and open the bib file
      try {
        const files = await api.listFiles();
        const store = useEditorStore.getState();
        store.setFileTree(files);
        const content = await api.readFile('references.bib');
        store.openFile('references.bib', content);
      } catch {}
      setTimeout(() => setExportMsg(null), 3000);
    } else {
      setExportMsg(result.error || 'Export failed');
      setTimeout(() => setExportMsg(null), 4000);
    }
  }, [selected]);

  const tabStyle = (t: SourceTab): React.CSSProperties => ({
    fontSize: 16,
    padding: '4px 14px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: tab === t ? 'var(--accent)' : 'transparent',
    color: tab === t ? 'white' : 'var(--text-secondary)',
  });

  const checkboxStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    margin: 0,
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  };

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          fontSize: 18,
        }}
      >
        {/* Source tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['All', 'Papers', 'Books'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            fontSize: 16,
            padding: '6px 12px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg-editor)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
            minWidth: 80,
          }}
        />

        {/* Export message */}
        {exportMsg && (
          <span style={{ fontSize: 15, color: 'var(--green)', whiteSpace: 'nowrap' }}>
            {exportMsg}
          </span>
        )}

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={selected.size === 0 || exporting}
          style={{
            fontSize: 16,
            padding: '4px 14px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            cursor: selected.size === 0 || exporting ? 'default' : 'pointer',
            fontFamily: 'inherit',
            background: selected.size > 0 ? 'var(--accent)' : 'transparent',
            color: selected.size > 0 ? 'white' : 'var(--text-dim)',
            opacity: exporting ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {exporting ? 'Exporting...' : `Export${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>

      </div>

      {/* Error banners */}
      {(tab !== 'Books' && papersError) && (
        <div style={{ fontSize: 15, color: 'var(--red)', padding: '6px 20px', background: 'var(--bg-warm)' }}>
          Papers: {papersError}
        </div>
      )}
      {(tab !== 'Papers' && attachmentsError) && (
        <div style={{ fontSize: 15, color: 'var(--red)', padding: '6px 20px', background: 'var(--bg-warm)' }}>
          Books: {attachmentsError}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
          <SpinnerIcon size={16} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', fontSize: 18 }}>
          {/* Table header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '8px 20px',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-dim)',
              fontSize: 16,
              fontWeight: 600,
              position: 'sticky',
              top: 0,
              background: 'var(--bg-panel)',
              zIndex: 1,
            }}
          >
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              style={checkboxStyle}
            />
            <span style={{ flex: 3 }}>Title</span>
            <span style={{ flex: 2 }}>Authors / Subject</span>
            <span style={{ width: 70, textAlign: 'center' }}>Source</span>
          </div>

          {/* Paper rows */}
          {filteredPapers.map((p) => {
            const key = `p:${p.id}`;
            return (
              <div
                key={key}
                onClick={() => toggleOne(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  background: selected.has(key) ? 'var(--accent-bg)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleOne(key)}
                  onClick={(e) => e.stopPropagation()}
                  style={checkboxStyle}
                />
                <span
                  style={{
                    flex: 3,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.title}
                </span>
                <span
                  style={{
                    flex: 2,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {parseAuthors(p.authors)}
                </span>
                <span
                  style={{
                    width: 70,
                    textAlign: 'center',
                    fontSize: 15,
                    color: 'var(--blue)',
                    fontWeight: 600,
                  }}
                >
                  Paper
                </span>
              </div>
            );
          })}

          {/* Attachment rows */}
          {filteredAttachments.map((a) => {
            const key = `a:${a.id}`;
            return (
              <div
                key={key}
                onClick={() => toggleOne(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  background: selected.has(key) ? 'var(--accent-bg)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() => toggleOne(key)}
                  onClick={(e) => e.stopPropagation()}
                  style={checkboxStyle}
                />
                <span
                  style={{
                    flex: 3,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.filename}
                </span>
                <span
                  style={{
                    flex: 2,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.subject || '\u2014'}
                </span>
                <span
                  style={{
                    width: 70,
                    textAlign: 'center',
                    fontSize: 15,
                    color: 'var(--teal)',
                    fontWeight: 600,
                  }}
                >
                  Book
                </span>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredPapers.length === 0 && filteredAttachments.length === 0 && !loading && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--text-dim)',
                fontSize: 18,
              }}
            >
              {search ? 'No references match your search' : 'No references available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
