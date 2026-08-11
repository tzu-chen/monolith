import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, QuoteIcon, PlusIcon } from '../shared/Icons';
import {
  PanelHeader,
  FilterRow,
  FilterInput,
  PanelBody,
  OutlinedButton,
  Pill,
  Badge,
  Dot,
  Checkbox,
  SectionLabel,
  rowStyle,
  hoverRow,
  leaveRow,
  EmptyState,
} from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { ENTER } from '../../lib/shortcuts';
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

/**
 * References panel (430px in the handoff, scaled here).
 *
 * The library lives in the companion Navigate/Scribe services, not in
 * `refs.bib` — so where the handoff's reference manager edits BibTeX fields in
 * place, this one browses what those services hold and imports selected entries
 * into the project's bib. The row grammar is the handoff's: status dot, title,
 * `Authors · Source` line, a badge row, and a `Cite ↵` action that appears on
 * the row you are pointing at.
 */

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

export default function ReferencesPanel() {
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

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'lookup' | 'paste'>('lookup');
  const [lookupQuery, setLookupQuery] = useState('');
  const [pasteText, setPasteText] = useState('');

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
      // Best-effort: the import already landed on disk.
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
        if (keys.length > 0) {
          useEditorStore.getState().insertAtCursor(`\\cite{${keys.join(',')}}`);
        }
        await refreshProject(result.file);
        flash(`Cited ${keys.length} reference${keys.length === 1 ? '' : 's'}`, 'ok');
        return;
      }

      await refreshProject(result.file);
      const parts = [`Added ${result.added}`];
      if (result.skipped > 0) parts.push(`skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}`);
      flash(parts.join(', '), 'ok');
    },
    [flash, refreshProject]
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

  const inputStyle: React.CSSProperties = {
    fontSize: fs.control,
    fontFamily: font.mono,
    padding: '6px 10px',
    border: '1px solid var(--line-strong)',
    borderRadius: radius.control,
    background: 'var(--surface-editor)',
    color: 'var(--text)',
    outline: 'none',
    width: '100%',
  };

  function EntryRow({
    entryKey,
    title,
    subtitle,
    source,
    inBib,
  }: {
    entryKey: string;
    title: string;
    subtitle: string;
    source: 'Paper' | 'File';
    inBib: boolean;
  }) {
    const isSel = selected.has(entryKey);
    const [hovered, setHovered] = useState(false);
    return (
      <div
        onClick={() => toggleOne(entryKey)}
        onMouseEnter={(e) => { setHovered(true); hoverRow(e, isSel); }}
        onMouseLeave={(e) => { setHovered(false); leaveRow(e, isSel); }}
        style={rowStyle(isSel, {
          alignItems: 'flex-start',
          gap: 10,
          padding: `8px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line-faint)',
          whiteSpace: 'normal',
        })}
      >
        <span style={{ paddingTop: 2 }}>
          <Checkbox checked={isSel} onChange={() => toggleOne(entryKey)} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontSize: fs.title,
              color: isSel ? 'var(--text)' : 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={title}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: fs.control,
                color: 'var(--text-faint)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Badge>{source}</Badge>
            {inBib ? (
              <Badge tone="ok">in refs.bib</Badge>
            ) : (
              <Badge tone="neutral">not imported</Badge>
            )}
            {!inBib && hovered && (
              <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <OutlinedButton
                  accent
                  icon={<QuoteIcon size={11} />}
                  title="Import and insert \cite at the cursor"
                  onClick={() => runImport(selectionToInput([entryKey]), true)}
                >
                  Cite {ENTER}
                </OutlinedButton>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PanelHeader title="References">
        <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-disabled)' }}>
          refs.bib · {libraryKeys.size}
        </span>
        <OutlinedButton accent icon={<PlusIcon size={11} />} onClick={() => setAddOpen(!addOpen)}>
          Import
        </OutlinedButton>
      </PanelHeader>

      {addOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: `10px ${metrics.padPanel}px`,
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill mono={false} active={addMode === 'lookup'} onClick={() => setAddMode('lookup')}>
              DOI / arXiv
            </Pill>
            <Pill mono={false} active={addMode === 'paste'} onClick={() => setAddMode('paste')}>
              Paste BibTeX
            </Pill>
          </div>
          {addMode === 'lookup' ? (
            <>
              <div style={{ display: 'flex', gap: 7 }}>
                <input
                  placeholder="arXiv:2405.11234"
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
                  style={inputStyle}
                />
                <OutlinedButton accent onClick={handleLookup} disabled={busy || !lookupQuery.trim()}>
                  Fetch
                </OutlinedButton>
              </div>
              <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>
                Paste a DOI, arXiv id, or BibTeX — it resolves and appends to refs.bib
              </span>
            </>
          ) : (
            <>
              <textarea
                placeholder="@article{key, … }"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', fontSize: fs.meta }}
              />
              <OutlinedButton
                accent
                onClick={handlePaste}
                disabled={busy || !pasteText.trim()}
                style={{ alignSelf: 'flex-start' }}
              >
                Add to refs.bib
              </OutlinedButton>
            </>
          )}
        </div>
      )}

      <FilterRow>
        <FilterInput value={search} onChange={setSearch} placeholder="Search references…" />
      </FilterRow>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `8px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <Pill key={t} mono={false} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={allVisibleSelected} onChange={toggleAll} title="Select all visible" />
          <SectionLabel>{visibleKeys.length} shown</SectionLabel>
        </span>
      </div>

      {(papersError || attachmentsError) && (
        <div
          style={{
            padding: `6px ${metrics.padPanel}px`,
            borderBottom: '1px solid var(--line)',
            borderLeft: '2px solid var(--error)',
            color: 'var(--error)',
            fontSize: fs.meta,
            flexShrink: 0,
            whiteSpace: 'normal',
          }}
        >
          {tab !== 'Files' && papersError && <div>Papers unavailable: {papersError}</div>}
          {tab !== 'Papers' && attachmentsError && <div>Files unavailable: {attachmentsError}</div>}
        </div>
      )}

      <PanelBody>
        {loading ? (
          <EmptyState><SpinnerIcon size={16} /></EmptyState>
        ) : visibleKeys.length === 0 ? (
          <EmptyState>
            {search ? 'No references match your search' : 'No references available — use Import to add one'}
          </EmptyState>
        ) : (
          <>
            {filteredPapers.map((p) => (
              <EntryRow
                key={`p:${p.id}`}
                entryKey={`p:${p.id}`}
                title={p.title}
                subtitle={parseAuthors(p.authors)}
                source="Paper"
                inBib={paperInBib(p)}
              />
            ))}
            {filteredAttachments.map((a) => (
              <EntryRow
                key={`a:${a.id}`}
                entryKey={`a:${a.id}`}
                title={a.filename}
                subtitle={a.subject || ''}
                source="File"
                inBib={attachmentInBib(a.id)}
              />
            ))}
          </>
        )}
      </PanelBody>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          padding: `9px ${metrics.padPanel}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: fs.meta, color: selected.size > 0 ? 'var(--accent)' : 'var(--text-faint)' }}>
          {selected.size} selected
        </span>
        {msg && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: fs.meta,
              color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            <Dot color={msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)'} filled />
            {msg.text}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexShrink: 0 }}>
          <OutlinedButton
            icon={<QuoteIcon size={11} />}
            onClick={() => runImport(selectionToInput([...selected]), true)}
            disabled={busy || selected.size === 0}
          >
            Insert \cite
          </OutlinedButton>
          <OutlinedButton
            accent
            onClick={() => runImport(selectionToInput([...selected]), false)}
            disabled={busy || selected.size === 0}
          >
            {busy ? 'Working…' : 'Import'}
          </OutlinedButton>
        </span>
      </div>
    </>
  );
}
