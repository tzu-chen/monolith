import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon, CopyIcon, SpinnerIcon } from '../shared/Icons';
import {
  Bar,
  SectionLabel,
  OutlinedButton,
  IconButton,
  Badge,
  Dot,
  EmptyState,
} from '../shared/ui';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';
import { ENTER } from '../../lib/shortcuts';
import {
  fetchLibrary,
  updateLibraryEntry,
  fieldValue,
  type LibraryEntry,
} from '../../lib/references-api';
import * as api from '../../lib/api';

/**
 * Reference entry editor — the detail half of the handoff's 1c.
 *
 * The named fields are the ones a citation is judged on, laid out as the
 * handoff draws them; every other field the entry carries is listed under them
 * rather than hidden, so editing here never silently drops what the `.bib`
 * already said. Edits are written back to the entry in place — the rest of the
 * file, and this entry's own untouched fields, keep their exact bytes.
 *
 * `Raw BibTeX` swaps the form for the entry's source. That one needs an
 * explicit save: a half-typed brace is a broken entry, not a typo.
 */

/** The venue field that matters for each entry type — a book has no journal. */
function venueField(type: string): { name: string; label: string } {
  switch (type) {
    case 'book':
    case 'inbook':
      return { name: 'publisher', label: 'Publisher' };
    case 'incollection':
    case 'inproceedings':
    case 'conference':
      return { name: 'booktitle', label: 'Book title' };
    case 'phdthesis':
    case 'mastersthesis':
      return { name: 'school', label: 'School' };
    case 'techreport':
      return { name: 'institution', label: 'Institution' };
    default:
      return { name: 'journal', label: 'Journal' };
  }
}

/** Fields the form lays out by name; anything else is rendered generically. */
function namedFields(type: string): { name: string; label: string }[] {
  return [
    { name: 'title', label: 'Title' },
    { name: 'author', label: 'Authors' },
    venueField(type),
    { name: 'year', label: 'Year' },
    { name: 'volume', label: 'Vol' },
    { name: 'pages', label: 'Pages' },
    { name: 'doi', label: 'DOI' },
  ];
}

const fieldBoxStyle: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: radius.control,
  background: 'transparent',
  color: 'var(--text)',
  fontFamily: font.ui,
  fontSize: fs.row,
  lineHeight: 1.5,
  padding: '7px 10px',
  width: '100%',
  outline: 'none',
  resize: 'none',
  transition: `border-color ${motion.color}`,
};

/** One labelled, editable field. Commits on blur; Escape reverts. */
function Field({
  label,
  value,
  mono,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const style: React.CSSProperties = {
    ...fieldBoxStyle,
    fontFamily: mono ? font.mono : font.ui,
    fontSize: mono ? fs.control : fs.row,
  };
  const commit = () => { if (draft !== value) onCommit(draft); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDraft(value);
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Enter' && !multiline) (e.target as HTMLElement).blur();
  };
  const focus = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--accent)';
  };
  const blur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--line)';
    commit();
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 4 }}><SectionLabel>{label}</SectionLabel></div>
      {multiline ? (
        <textarea
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={focus}
          onBlur={blur}
          style={style}
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={focus}
          onBlur={blur}
          style={style}
        />
      )}
    </div>
  );
}

/** `main.tex:45` — one place this key is cited, as a jump target. */
function UseChip({ file, line }: { file: string; line: number }) {
  const jump = async () => {
    const state = useEditorStore.getState();
    if (state.activeTabPath !== file) {
      try {
        const existing = state.openTabs.find((t) => t.path === file);
        if (existing) state.setActiveTab(file);
        else state.openFile(file, await api.readFile(file));
      } catch {
        return;
      }
    }
    state.requestScrollToLine(line);
  };

  return (
    <span
      onClick={jump}
      title={`Go to ${file}:${line}`}
      style={{
        fontFamily: font.mono,
        fontSize: fs.meta,
        color: 'var(--text-muted)',
        cursor: 'pointer',
        transition: `color ${motion.color}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {file}:{line}
    </span>
  );
}

export default function ReferenceDetail({ entryKey }: { entryKey: string }) {
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const libraryNonce = useEditorStore((s) => s.libraryNonce);
  const invalidateLibrary = useEditorStore((s) => s.invalidateLibrary);

  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawMode, setRawMode] = useState(false);
  const [rawDraft, setRawDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const library = await fetchLibrary();
      if (cancelled) return;
      const found = library.entries.find((e) => e.key === entryKey) ?? null;
      setEntry(found);
      setRawDraft(found?.raw ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [entryKey, libraryNonce]);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3000);
  }, []);

  const saveField = useCallback(
    async (name: string, value: string) => {
      if (!entry) return;
      setBusy(true);
      const result = await updateLibraryEntry({ key: entry.key, file: entry.file, fields: { [name]: value } });
      setBusy(false);
      if (result.error) {
        flash(result.error, 'err');
        return;
      }
      flash(`Saved ${name}`, 'ok');
      invalidateLibrary();
    },
    [entry, flash, invalidateLibrary]
  );

  const saveRaw = useCallback(async () => {
    if (!entry) return;
    setBusy(true);
    const result = await updateLibraryEntry({ key: entry.key, file: entry.file, raw: rawDraft });
    setBusy(false);
    if (result.error) {
      flash(result.error, 'err');
      return;
    }
    flash('Entry saved', 'ok');
    invalidateLibrary();
  }, [entry, rawDraft, flash, invalidateLibrary]);

  const insertCite = useCallback(() => {
    if (!entry) return;
    useEditorStore.getState().insertAtCursor(`\\cite{${entry.key}}`);
  }, [entry]);

  const copyKey = useCallback(async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.key);
      flash('Key copied', 'ok');
    } catch {
      flash('Clipboard unavailable', 'err');
    }
  }, [entry, flash]);

  const named = useMemo(() => (entry ? namedFields(entry.type) : []), [entry]);
  const extras = useMemo(() => {
    if (!entry) return [];
    const shown = new Set(named.map((f) => f.name));
    return entry.fields.filter((f) => !shown.has(f.name));
  }, [entry, named]);

  const close = () => setManagerDetail(null);

  if (loading) {
    return (
      <>
        <Bar height={metrics.header} padding={metrics.padPane}>
          <SectionLabel>Reference</SectionLabel>
          <span style={{ marginLeft: 'auto' }}>
            <IconButton bare size={24} icon={<CloseIcon size={13} />} title="Close" onClick={close} />
          </span>
        </Bar>
        <EmptyState><SpinnerIcon size={16} /></EmptyState>
      </>
    );
  }

  if (!entry) {
    return (
      <>
        <Bar height={metrics.header} padding={metrics.padPane}>
          <span style={{ fontFamily: font.mono, fontSize: fs.control, color: 'var(--text-muted)' }}>
            {entryKey}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <IconButton bare size={24} icon={<CloseIcon size={13} />} title="Close" onClick={close} />
          </span>
        </Bar>
        <EmptyState>This entry is no longer in the project’s .bib files</EmptyState>
      </>
    );
  }

  return (
    <>
      <Bar height={metrics.header} padding={metrics.padPane}>
        <span
          style={{ fontFamily: font.mono, fontSize: fs.control, color: 'var(--accent)' }}
          title={`${entry.file} · @${entry.type}`}
        >
          @{entry.type}&#123;{entry.key}&#125;
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          <OutlinedButton
            accent={rawMode}
            onClick={() => { setRawDraft(entry.raw); setRawMode(!rawMode); }}
          >
            Raw BibTeX
          </OutlinedButton>
          <IconButton bare size={24} icon={<CloseIcon size={13} />} title="Close" onClick={close} />
        </span>
      </Bar>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: `14px ${metrics.padPane}px` }}>
        {rawMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              value={rawDraft}
              onChange={(e) => setRawDraft(e.target.value)}
              spellCheck={false}
              style={{
                ...fieldBoxStyle,
                fontFamily: font.mono,
                fontSize: fs.control,
                lineHeight: 1.75,
                minHeight: 320,
                resize: 'vertical',
                background: 'var(--surface-editor)',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>
                The cite key must stay <code style={{ fontFamily: font.mono }}>{entry.key}</code>
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                <OutlinedButton onClick={() => setRawDraft(entry.raw)} disabled={rawDraft === entry.raw}>
                  Revert
                </OutlinedButton>
                <OutlinedButton accent onClick={saveRaw} disabled={busy || rawDraft === entry.raw}>
                  {busy ? 'Saving…' : 'Save entry'}
                </OutlinedButton>
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Field
              label="Title"
              multiline
              value={fieldValue(entry, 'title')}
              onCommit={(v) => saveField('title', v)}
            />
            <Field
              label="Authors"
              multiline
              value={fieldValue(entry, 'author')}
              onCommit={(v) => saveField('author', v)}
            />
            <div style={{ display: 'flex', gap: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field
                  label={venueField(entry.type).label}
                  value={fieldValue(entry, venueField(entry.type).name)}
                  onCommit={(v) => saveField(venueField(entry.type).name, v)}
                />
              </div>
              <div style={{ width: 96, flexShrink: 0 }}>
                <Field label="Year" value={fieldValue(entry, 'year')} onCommit={(v) => saveField('year', v)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <div style={{ width: 88, flexShrink: 0 }}>
                <Field label="Vol" value={fieldValue(entry, 'volume')} onCommit={(v) => saveField('volume', v)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Pages" value={fieldValue(entry, 'pages')} onCommit={(v) => saveField('pages', v)} />
              </div>
            </div>
            <Field label="DOI" mono value={fieldValue(entry, 'doi')} onCommit={(v) => saveField('doi', v)} />

            {extras.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }}>
                  <SectionLabel>Other fields</SectionLabel>
                </div>
                {extras.map((field) => (
                  <Field
                    key={field.name}
                    label={field.name}
                    mono
                    multiline={field.value.length > 60}
                    value={field.value}
                    onCommit={(v) => saveField(field.name, v)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          padding: `12px ${metrics.padPane}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {entry.issues.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {entry.issues.map((issue) => (
              <Badge key={issue} tone="error">{issue}</Badge>
            ))}
          </div>
        )}

        <SectionLabel>Cited at</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, rowGap: 3, alignItems: 'baseline' }}>
          {entry.uses.length === 0 ? (
            <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>
              Not cited anywhere in this project
            </span>
          ) : (
            entry.uses.map((use, i) => (
              <span key={`${use.file}:${use.line}:${i}`} style={{ display: 'flex', gap: 4 }}>
                {i > 0 && <span style={{ fontSize: fs.meta, color: 'var(--text-disabled)' }}>·</span>}
                <UseChip file={use.file} line={use.line} />
              </span>
            ))
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
          <OutlinedButton accent onClick={insertCite} style={{ flex: 1 }}>
            Insert \cite at cursor {ENTER}
          </OutlinedButton>
          <OutlinedButton icon={<CopyIcon size={11} />} onClick={copyKey}>
            Copy key
          </OutlinedButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
          <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-disabled)' }}>
            {entry.file}
          </span>
          {msg && (
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: fs.meta,
                color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <Dot color={msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)'} filled />
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
