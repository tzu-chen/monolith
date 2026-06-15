import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, CloseIcon, QuoteIcon, PlusIcon } from '../shared/Icons';
import {
  fetchPapers,
  fetchAttachments,
  fetchLibraryKeys,
  lookupReference,
  importReferences,
  type NavigatePaper,
  type ScribeAttachment,
  type ImportInput,
} from '../../lib/references-api';
import * as api from '../../lib/api';

type SourceTab = 'All' | 'Papers' | 'Files';
const TABS: SourceTab[] = ['All', 'Papers', 'Files'];

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

function attachmentKey(id: string): string {
  return `scribe_${id.slice(0, 8)}`;
}

function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/** Convert selection keys ('p:<id>' / 'a:<id>') into an import request payload. */
function selectionToInput(keys: string[]): ImportInput {
  const paperIds: number[] = [];
  const attachmentIds: string[] = [];
  for (const k of keys) {
    if (k.startsWith('p:')) paperIds.push(Number(k.slice(2)));
    else if (k.startsWith('a:')) attachmentIds.push(k.slice(2));
  }
  return { paperIds, attachmentIds };
}

export default function ReferenceModal() {
  const close = useEditorStore((s) => s.setShowReferences);

  const [tab, setTab] = useState<SourceTab>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [papers, setPapers] = useState<NavigatePaper[]>([]);
  const [attachments, setAttachments] = useState<ScribeAttachment[]>([]);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [libraryKeys, setLibraryKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  // Add-reference panel
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'lookup' | 'paste'>('lookup');
  const [lookupQuery, setLookupQuery] = useState('');
  const [pasteText, setPasteText] = useState('');

  const closeModal = useCallback(() => close(false), [close]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    const [pRes, aRes, keys] = await Promise.all([fetchPapers(), fetchAttachments(), fetchLibraryKeys()]);
    setPapers(pRes.papers);
    setPapersError(pRes.error ?? null);
    setAttachments(aRes.attachments);
    setAttachmentsError(aRes.error ?? null);
    setLibraryKeys(new Set(keys));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  const query = search.toLowerCase();

  const filteredPapers = useMemo(() => {
    if (tab === 'Files') return [];
    return papers.filter(
      (p) =>
        !query ||
        p.title.toLowerCase().includes(query) ||
        parseAuthors(p.authors).toLowerCase().includes(query)
    );
  }, [papers, tab, query]);

  const filteredAttachments = useMemo(() => {
    if (tab === 'Papers') return [];
    return attachments.filter(
      (a) =>
        !query ||
        a.filename.toLowerCase().includes(query) ||
        (a.subject && a.subject.toLowerCase().includes(query))
    );
  }, [attachments, tab, query]);

  const libraryNorm = useMemo(() => [...libraryKeys].map(normalize), [libraryKeys]);
  const attachmentInBib = useCallback((id: string) => libraryKeys.has(attachmentKey(id)), [libraryKeys]);
  const paperInBib = useCallback(
    (p: NavigatePaper) => {
      const id = normalize(p.arxiv_id || '');
      return id.length > 0 && libraryNorm.some((k) => k.includes(id));
    },
    [libraryNorm]
  );

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
    setSelected((prev) => {
      const next = new Set(prev);
      const add = !allVisibleSelected;
      for (const k of visibleKeys) {
        if (add) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, [allVisibleSelected, visibleKeys]);

  /** Reload the file tree and the imported .bib tab, and refresh the "in bib" set. */
  const refreshProject = useCallback(async (file: string) => {
    try {
      const store = useEditorStore.getState();
      store.setFileTree(await api.listFiles());
      store.openFile(file, await api.readFile(file));
    } catch {
      // file tree / bib reload is best-effort
    }
    setLibraryKeys(new Set(await fetchLibraryKeys()));
  }, []);

  const runImport = useCallback(
    async (input: ImportInput, cite: boolean) => {
      setBusy(true);
      const result = await importReferences(input);
      setBusy(false);
      if (result.error) {
        flash(result.error, 'err');
        return;
      }

      if (cite) {
        const keys = [...result.keys, ...result.skippedKeys];
        const view = useEditorStore.getState().editorView;
        if (view && keys.length > 0) {
          const text = `\\cite{${keys.join(',')}}`;
          const { head } = view.state.selection.main;
          view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length } });
          view.focus();
        }
        await refreshProject(result.file);
        closeModal();
        return;
      }

      await refreshProject(result.file);
      const parts = [`Added ${result.added}`];
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}`);
      flash(parts.join(', '), 'ok');
    },
    [flash, refreshProject, closeModal]
  );

  const handleLookup = useCallback(async () => {
    const q = lookupQuery.trim();
    if (!q) return;
    setBusy(true);
    const result = await lookupReference(q);
    setBusy(false);
    if (result.error || !result.bibtex) {
      flash(result.error || 'No reference found', 'err');
      return;
    }
    setLookupQuery('');
    await runImport({ bibtex: result.bibtex }, false);
  }, [lookupQuery, flash, runImport]);

  const handlePaste = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) return;
    setPasteText('');
    await runImport({ bibtex: text }, false);
  }, [pasteText, runImport]);

  const accentBtn = (enabled: boolean): React.CSSProperties => ({
    fontSize: 15,
    padding: '5px 14px',
    borderRadius: 5,
    border: '1px solid var(--accent)',
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'inherit',
    fontWeight: 500,
    background: enabled ? 'var(--accent)' : 'transparent',
    color: enabled ? 'white' : 'var(--text-dim)',
    borderColor: enabled ? 'var(--accent)' : 'var(--border)',
    opacity: busy ? 0.6 : 1,
    whiteSpace: 'nowrap',
  });

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    background: 'var(--bg-editor)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    outline: 'none',
  };

  const checkboxStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    margin: 0,
    cursor: 'pointer',
    accentColor: 'var(--accent)',
    flexShrink: 0,
  };

  const renderRow = (opts: {
    key: string;
    title: string;
    subtitle: string;
    chip: string;
    chipColor: string;
    inBib: boolean;
  }) => {
    const { key, title, subtitle, chip, chipColor, inBib } = opts;
    const isSel = selected.has(key);
    return (
      <div
        key={key}
        onClick={() => toggleOne(key)}
        className="ref-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 18px',
          cursor: 'pointer',
          background: isSel ? 'var(--accent-bg)' : 'transparent',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <input
          type="checkbox"
          checked={isSel}
          onChange={() => toggleOne(key)}
          onClick={(e) => e.stopPropagation()}
          style={checkboxStyle}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: chipColor,
            background: 'var(--bg-warm)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 7px',
            flexShrink: 0,
          }}
        >
          {chip}
        </span>
        {inBib ? (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, flexShrink: 0, width: 84, textAlign: 'right' }}>
            ✓ in bib
          </span>
        ) : (
          <button
            className="ref-cite"
            title="Insert \cite and import"
            onClick={(e) => {
              e.stopPropagation();
              runImport(selectionToInput([key]), true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
              width: 84,
              justifyContent: 'flex-end',
            }}
          >
            <QuoteIcon size={12} /> cite
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={closeModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <style>{`.ref-cite{opacity:0;transition:opacity .12s}.ref-row:hover .ref-cite{opacity:1}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 'min(740px, 94vw)',
          height: 'min(80vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0, marginRight: 4 }}>
            References
          </h2>
          {/* Source segmented control */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-editor)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 2,
              gap: 2,
            }}
          >
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    fontSize: 14,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    border: 'none',
                    padding: '2px 12px',
                    borderRadius: 4,
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'white' : 'var(--text-dim)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 80 }}
          />
          <button onClick={closeModal} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4, display: 'flex' }}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Add reference */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setAddOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '8px 18px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--text-secondary)',
              textAlign: 'left',
            }}
          >
            <PlusIcon size={13} /> Add reference {addOpen ? '▾' : '▸'}
          </button>
          {addOpen && (
            <div style={{ padding: '0 18px 14px' }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
                {(['lookup', 'paste'] as const).map((m) => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="radio" checked={addMode === m} onChange={() => setAddMode(m)} style={{ accentColor: 'var(--accent)' }} />
                    {m === 'lookup' ? 'DOI / arXiv ID' : 'Paste BibTeX'}
                  </label>
                ))}
              </div>
              {addMode === 'lookup' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="10.1103/PhysRevD.7.1888  or  2301.12345"
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={handleLookup} disabled={busy || !lookupQuery.trim()} style={accentBtn(!busy && !!lookupQuery.trim())}>
                    Get
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    placeholder="@article{key, ... }"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={5}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: "'Source Code Pro', monospace", fontSize: 13 }}
                  />
                  <button onClick={handlePaste} disabled={busy || !pasteText.trim()} style={{ ...accentBtn(!busy && !!pasteText.trim()), alignSelf: 'flex-start' }}>
                    Add to bib
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error banners */}
        {tab !== 'Files' && papersError && (
          <div style={{ fontSize: 13, color: 'var(--red)', padding: '6px 18px', background: 'var(--bg-warm)' }}>
            Papers unavailable: {papersError}
          </div>
        )}
        {tab !== 'Papers' && attachmentsError && (
          <div style={{ fontSize: 13, color: 'var(--red)', padding: '6px 18px', background: 'var(--bg-warm)' }}>
            Files unavailable: {attachmentsError}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <SpinnerIcon size={16} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Sticky select-all header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '6px 18px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--bg-panel)',
                zIndex: 1,
                color: 'var(--text-dim)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} style={checkboxStyle} />
              <span>{visibleKeys.length} item{visibleKeys.length === 1 ? '' : 's'}</span>
            </div>

            {filteredPapers.map((p) =>
              renderRow({
                key: `p:${p.id}`,
                title: p.title,
                subtitle: parseAuthors(p.authors),
                chip: 'Paper',
                chipColor: 'var(--blue)',
                inBib: paperInBib(p),
              })
            )}
            {filteredAttachments.map((a) =>
              renderRow({
                key: `a:${a.id}`,
                title: a.filename,
                subtitle: a.subject || '',
                chip: 'File',
                chipColor: 'var(--teal)',
                inBib: attachmentInBib(a.id),
              })
            )}

            {filteredPapers.length === 0 && filteredAttachments.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 15 }}>
                {search ? 'No references match your search' : 'No references available — add one above'}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {selected.size} selected
          </span>
          {msg && (
            <span style={{ fontSize: 14, color: msg.tone === 'ok' ? 'var(--green)' : 'var(--red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.text}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => runImport(selectionToInput([...selected]), true)}
              disabled={busy || selected.size === 0}
              style={{
                ...accentBtn(false),
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: busy || selected.size === 0 ? 'default' : 'pointer',
                color: selected.size > 0 ? 'var(--accent)' : 'var(--text-dim)',
                borderColor: selected.size > 0 ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <QuoteIcon size={13} /> Insert \cite
            </button>
            <button
              onClick={() => runImport(selectionToInput([...selected]), false)}
              disabled={busy || selected.size === 0}
              style={accentBtn(!busy && selected.size > 0)}
            >
              {busy ? 'Working…' : `Import${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
