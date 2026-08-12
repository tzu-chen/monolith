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
import { ENTER } from '../../lib/keybindings';
import {
  fetchPapers,
  fetchAttachments,
  fetchLibrary,
  lookupReference,
  importReferences,
  fieldValue,
  shortAuthors,
  sourceLine,
  type NavigatePaper,
  type ScribeAttachment,
  type ImportInput,
  type Library,
  type LibraryEntry,
} from '../../lib/references-api';
import * as api from '../../lib/api';

/**
 * References panel — the list half of the handoff's reference manager (1c).
 *
 * The first tab is the project's own `.bib`: every entry, with the cite count
 * and field defects that make it triageable, in the handoff's row grammar
 * (status dot, title, `Authors · Source`, key chip, badges, `Cite ↵`).
 * Selecting a row opens the entry editor in the detail column beside this one.
 *
 * The other two tabs browse the companion Navigate/Scribe services and import
 * from them — the library those hold is not the project's `.bib`, so bringing
 * an entry across is an explicit act rather than a live view.
 */

type SourceTab = 'library' | 'papers' | 'files';
const TABS: { value: SourceTab; label: string }[] = [
  { value: 'library', label: 'refs.bib' },
  { value: 'papers', label: 'Papers' },
  { value: 'files', label: 'Files' },
];

/** The list filters that ride beside the search field on the library tab. */
type LibraryFilter = 'all' | 'cited' | 'issues';

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

/** Strip the braces a BibTeX title uses to protect capitalisation. */
function plain(value: string): string {
  return value.replace(/[{}]/g, '').trim();
}

const EMPTY_LIBRARY: Library = { files: [], entries: [], missing: [] };

export default function ReferencesPanel() {
  const [tab, setTab] = useState<SourceTab>('library');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const managerDetail = useEditorStore((s) => s.managerDetail);
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const libraryNonce = useEditorStore((s) => s.libraryNonce);
  const invalidateLibrary = useEditorStore((s) => s.invalidateLibrary);
  const activeKey = managerDetail?.kind === 'reference' ? managerDetail.key : null;

  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);

  const [papers, setPapers] = useState<NavigatePaper[]>([]);
  const [attachments, setAttachments] = useState<ScribeAttachment[]>([]);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'lookup' | 'paste'>('lookup');
  const [lookupQuery, setLookupQuery] = useState('');
  const [pasteText, setPasteText] = useState('');

  // The library re-reads on any .bib or .tex change; the external sources are
  // fetched once, since nothing in this app changes them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchLibrary();
      if (cancelled) return;
      setLibrary({ files: result.files, entries: result.entries, missing: result.missing });
      setLibraryError(result.error ?? null);
      setLibraryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [libraryNonce]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, aRes] = await Promise.all([fetchPapers(), fetchAttachments()]);
      if (cancelled) return;
      setPapers(pRes.papers);
      setPapersError(pRes.error ?? null);
      setAttachments(aRes.attachments);
      setAttachmentsError(aRes.error ?? null);
      setSourcesLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  const query = search.toLowerCase();

  const libraryKeys = useMemo(
    () => new Set(library.entries.map((e) => e.key)),
    [library.entries]
  );

  const citedCount = useMemo(
    () => library.entries.filter((e) => e.uses.length > 0).length,
    [library.entries]
  );
  const issueCount = useMemo(
    () => library.entries.filter((e) => e.issues.length > 0).length,
    [library.entries]
  );

  const filteredEntries = useMemo(() => {
    return library.entries.filter((e) => {
      if (filter === 'cited' && e.uses.length === 0) return false;
      if (filter === 'issues' && e.issues.length === 0) return false;
      if (!query) return true;
      return (
        e.key.toLowerCase().includes(query) ||
        plain(fieldValue(e, 'title')).toLowerCase().includes(query) ||
        fieldValue(e, 'author').toLowerCase().includes(query) ||
        sourceLine(e).toLowerCase().includes(query)
      );
    });
  }, [library.entries, filter, query]);

  const filteredPapers = useMemo(() => {
    if (tab !== 'papers') return [];
    return papers.filter(
      (p) =>
        !query ||
        p.title.toLowerCase().includes(query) ||
        parseAuthors(p.authors).toLowerCase().includes(query)
    );
  }, [papers, tab, query]);

  const filteredAttachments = useMemo(() => {
    if (tab !== 'files') return [];
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

  /** Reload the file tree and the imported .bib tab, and re-read the library. */
  const refreshProject = useCallback(async (file: string) => {
    try {
      const store = useEditorStore.getState();
      store.setFileTree(await api.listFiles());
      store.openFile(file, await api.readFile(file));
    } catch {
      // Best-effort: the import already landed on disk.
    }
    invalidateLibrary();
  }, [invalidateLibrary]);

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

  const citeEntry = useCallback((entry: LibraryEntry) => {
    useEditorStore.getState().insertAtCursor(`\\cite{${entry.key}}`);
  }, []);

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

  /** A `.bib` entry, in the handoff's row grammar. */
  function LibraryRow({ entry }: { entry: LibraryEntry }) {
    const active = activeKey === entry.key;
    const [hovered, setHovered] = useState(false);
    const cited = entry.uses.length > 0;
    const broken = entry.issues.length > 0;
    const title = plain(fieldValue(entry, 'title')) || entry.key;
    const subtitle = [shortAuthors(entry), sourceLine(entry)].filter(Boolean).join(' · ');

    return (
      <div
        onClick={() => setManagerDetail({ kind: 'reference', key: entry.key })}
        onMouseEnter={(e) => { setHovered(true); hoverRow(e, active); }}
        onMouseLeave={(e) => { setHovered(false); leaveRow(e, active); }}
        style={rowStyle(active, {
          alignItems: 'flex-start',
          gap: 10,
          padding: `9px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line-faint)',
          whiteSpace: 'normal',
        })}
      >
        <span style={{ paddingTop: 6 }}>
          <Dot
            color={broken ? 'var(--error)' : cited ? 'var(--accent)' : 'var(--line-strong)'}
            filled={cited && !broken}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontSize: fs.title,
              color: active ? 'var(--text)' : 'var(--text-muted)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Badge mono tone={cited ? 'accent' : undefined}>{entry.key}</Badge>
            <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>
              {cited ? `cited ${entry.uses.length}×` : 'uncited'}
            </span>
            {entry.issues.map((issue) => (
              <Badge key={issue} tone="error">{issue}</Badge>
            ))}
            {(hovered || active) && (
              <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <OutlinedButton
                  accent
                  title={`Insert \\cite{${entry.key}} at the cursor`}
                  onClick={() => citeEntry(entry)}
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

  /** A key cited in the sources that no `.bib` defines — a compile error in waiting. */
  function MissingRow({ entry }: { entry: Library['missing'][number] }) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: `9px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line-faint)',
          borderLeft: '2px solid var(--error)',
          whiteSpace: 'normal',
        }}
      >
        <span style={{ paddingTop: 6 }}><Dot color="var(--error)" /></span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: font.mono, fontSize: fs.row, color: 'var(--text)' }}>{entry.key}</span>
          <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>
            cited {entry.uses.length}× · not in any .bib
          </span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <OutlinedButton
            title="Look this key up by DOI or arXiv id"
            onClick={() => { setAddOpen(true); setAddMode('lookup'); setLookupQuery(entry.key); }}
          >
            Resolve
          </OutlinedButton>
        </span>
      </div>
    );
  }

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

  const bibLabel = library.files.length === 1 ? library.files[0] : `${library.files.length} .bib files`;

  return (
    <>
      <PanelHeader title="References">
        <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-disabled)' }}>
          {library.files.length === 0 ? 'no .bib' : `${bibLabel} · ${library.entries.length}`}
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
        <FilterInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'library' ? 'Search author, title, key…' : 'Search references…'}
        />
        {tab === 'library' && (
          <>
            <Pill
              mono={false}
              active={filter === 'cited'}
              onClick={() => setFilter(filter === 'cited' ? 'all' : 'cited')}
            >
              Cited ({citedCount})
            </Pill>
            <Pill
              mono={false}
              tone={filter === 'issues' ? 'error' : undefined}
              onClick={() => setFilter(filter === 'issues' ? 'all' : 'issues')}
            >
              Issues ({issueCount})
            </Pill>
          </>
        )}
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
          <Pill key={t.value} mono={false} active={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
          </Pill>
        ))}
        {tab !== 'library' && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Checkbox checked={allVisibleSelected} onChange={toggleAll} title="Select all visible" />
            <SectionLabel>{visibleKeys.length} shown</SectionLabel>
          </span>
        )}
      </div>

      {((tab === 'library' && libraryError) ||
        (tab === 'papers' && papersError) ||
        (tab === 'files' && attachmentsError)) && (
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
          {tab === 'library' && libraryError}
          {tab === 'papers' && papersError && `Papers unavailable: ${papersError}`}
          {tab === 'files' && attachmentsError && `Files unavailable: ${attachmentsError}`}
        </div>
      )}

      <PanelBody>
        {tab === 'library' ? (
          libraryLoading ? (
            <EmptyState><SpinnerIcon size={16} /></EmptyState>
          ) : library.entries.length === 0 ? (
            <EmptyState>
              {library.files.length === 0
                ? 'This project has no .bib file yet — use Import to start one'
                : 'No entries in the project’s .bib files'}
            </EmptyState>
          ) : filteredEntries.length === 0 && (filter !== 'issues' || library.missing.length === 0) ? (
            <EmptyState>No entries match</EmptyState>
          ) : (
            <>
              {filteredEntries.map((entry) => (
                <LibraryRow key={`${entry.file}:${entry.key}`} entry={entry} />
              ))}
              {library.missing.length > 0 && filter !== 'cited' && (
                <>
                  <div style={{ padding: `10px ${metrics.padPanel}px 6px` }}>
                    <SectionLabel>Cited but undefined</SectionLabel>
                  </div>
                  {library.missing.map((entry) => (
                    <MissingRow key={entry.key} entry={entry} />
                  ))}
                </>
              )}
            </>
          )
        ) : sourcesLoading ? (
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

      {tab === 'library' ? (
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
            fontSize: fs.meta,
            color: 'var(--text-faint)',
          }}
        >
          <span>{filteredEntries.length} shown</span>
          {msg && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
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
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
            Select an entry to edit it
          </span>
        </div>
      ) : (
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
      )}
    </>
  );
}
