import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore, type ManagerDetail } from '../../stores/editorStore';
import { CloseIcon, ExternalIcon, PlusIcon, MinusIcon } from '../shared/Icons';
import { Bar, SectionLabel, OutlinedButton, IconButton, Pill, Dot } from '../shared/ui';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';
import { ENTER } from '../../lib/keybindings';
import { formatIsoAge } from '../../lib/time';
import * as api from '../../lib/api';
import type { PlotMeta, PyramidLink } from '../../lib/api';

/**
 * Plot preview and insert controls — the detail half of the handoff's 1f.
 *
 * The preview is the figure at a stated zoom on a paper sheet, headed by what
 * you are about to include (size and intrinsic dimensions, read from the file's
 * own bytes) and footed by how fresh it is and how many versions of it this
 * project has seen. Below that, the snippet you will actually insert, composed
 * live from the insert-as choice and the width — the handoff shows the code
 * because the code is the point.
 */

type PlotDetailProps = { detail: Extract<ManagerDetail, { kind: 'plot' }> };

type InsertMode = 'figure' | 'includegraphics' | 'wrapfigure';

const INSERT_MODES: { value: InsertMode; label: string }[] = [
  { value: 'figure', label: 'figure environment' },
  { value: 'includegraphics', label: 'includegraphics only' },
  { value: 'wrapfigure', label: 'wrapfigure' },
];

/** Zoom steps the −/+ buttons walk, as the handoff's percentages. */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.8, 2.4, 3.2, 4];

/** Compose the snippet from the current insert mode and width. */
function snippetFor(mode: InsertMode, relPath: string, width: string): string {
  const stem = relPath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const label = stem.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const include = `\\includegraphics[width=${width}]{${relPath}}`;

  if (mode === 'includegraphics') return `${include}\n`;
  if (mode === 'wrapfigure') {
    return (
      `\\begin{wrapfigure}{r}{${width}}\n` +
      `  \\centering\n` +
      `  ${include}\n` +
      `  \\caption{${stem}}\n` +
      `  \\label{fig:${label}}\n` +
      `\\end{wrapfigure}\n`
    );
  }
  return (
    `\\begin{figure}[htbp]\n` +
    `  \\centering\n` +
    `  ${include}\n` +
    `  \\caption{${stem}}\n` +
    `  \\label{fig:${label}}\n` +
    `\\end{figure}\n`
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `216 KB · 6.4 × 4.2 in` — what the header states about the file. */
function describeMeta(meta: PlotMeta | null): string {
  if (!meta) return '';
  const parts = [formatBytes(meta.bytes)];
  if (meta.width !== undefined && meta.height !== undefined) {
    const round = (n: number) => (meta.unit === 'in' ? n.toFixed(1) : String(Math.round(n)));
    parts.push(`${round(meta.width)} × ${round(meta.height)} ${meta.unit ?? ''}`.trim());
  }
  return parts.join(' · ');
}

/**
 * The snippet, coloured by the editor's own syntax tokens. Small enough to do
 * by hand — a CodeMirror instance for four read-only lines would be heavier
 * than the thing it renders.
 */
function Snippet({ code }: { code: string }) {
  const parts = useMemo(() => {
    const tokens: { text: string; color?: string }[] = [];
    // \begin{env} / \end{env} / \command / [options] / {arg}
    const re = /(\\(?:begin|end))(\{)([^}]*)(\})|(\\[a-zA-Z]+)|(\[[^\]]*\])/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) tokens.push({ text: code.slice(last, m.index) });
      if (m[1]) {
        tokens.push({ text: m[1], color: 'var(--syn-command)' });
        tokens.push({ text: m[2] });
        tokens.push({ text: m[3], color: 'var(--syn-env)' });
        tokens.push({ text: m[4] });
      } else if (m[5]) {
        tokens.push({ text: m[5], color: 'var(--syn-ref)' });
      } else if (m[6]) {
        tokens.push({ text: m[6], color: 'var(--syn-number)' });
      }
      last = re.lastIndex;
    }
    if (last < code.length) tokens.push({ text: code.slice(last) });
    return tokens;
  }, [code]);

  return (
    <pre
      style={{
        margin: 0,
        border: '1px solid var(--line)',
        borderRadius: radius.control,
        background: 'var(--surface-editor)',
        padding: '10px 12px',
        fontFamily: font.mono,
        fontSize: fs.control,
        lineHeight: 1.75,
        color: 'var(--text-muted)',
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}
    >
      {parts.map((part, i) => (
        <span key={i} style={part.color ? { color: part.color } : undefined}>{part.text}</span>
      ))}
    </pre>
  );
}

export default function PlotDetail({ detail }: PlotDetailProps) {
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const insertAtCursor = useEditorStore((s) => s.insertAtCursor);

  const [meta, setMeta] = useState<PlotMeta | null>(null);
  const [link, setLink] = useState<PyramidLink | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [insertMode, setInsertMode] = useState<InsertMode>('figure');
  const [insertWidth, setInsertWidth] = useState('0.86\\linewidth');
  const [targetDir, setTargetDir] = useState('figures');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const src = api.pyramidRawUrl(detail.sessionId, detail.fileId);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  // Size and dimensions come from the bytes; the link record says whether this
  // project already holds a copy, and how many versions of it it has seen.
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setZoom(1);
    setFit(true);
    (async () => {
      const result = await api.pyramidPlotMeta(detail.sessionId, detail.fileId);
      if (!cancelled) setMeta(result);
    })();
    return () => { cancelled = true; };
  }, [detail.sessionId, detail.fileId]);

  const loadLink = useCallback(async () => {
    try {
      const links = await api.listPyramidLinks();
      setLink(links.find((l) => l.fileId === detail.fileId && l.sessionId === detail.sessionId) ?? null);
    } catch {
      setLink(null);
    }
  }, [detail.sessionId, detail.fileId]);

  useEffect(() => { loadLink(); }, [loadLink]);

  const relPath = link?.path ?? `${targetDir ? `${targetDir}/` : ''}${detail.filename}`;
  const snippet = useMemo(
    () => snippetFor(insertMode, relPath, insertWidth),
    [insertMode, relPath, insertWidth]
  );
  const revisions = link?.revisions?.length ?? 0;

  const stepZoom = (direction: 1 | -1) => {
    setFit(false);
    setZoom((current) => {
      if (direction === 1) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
      return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
    });
  };

  /** Import the plot and drop the snippet at the cursor. */
  const insert = useCallback(
    async (overwrite: boolean) => {
      setBusy(true);
      try {
        const { path } = await api.importPyramidPlot({
          sessionId: detail.sessionId,
          fileId: detail.fileId,
          filename: detail.filename,
          sessionTitle: detail.sessionTitle,
          targetDir: overwrite && link ? link.path.split('/').slice(0, -1).join('/') : targetDir,
          overwrite,
        });
        insertAtCursor(snippetFor(insertMode, path, insertWidth));
        try {
          useEditorStore.getState().setFileTree(await api.listFiles());
        } catch {
          // The file landed; the tree will catch up on the next watcher event.
        }
        await loadLink();
        flash(`Inserted ${path}`, 'ok');
      } catch (err) {
        flash(String((err as Error).message || err), 'err');
      } finally {
        setBusy(false);
      }
    },
    [detail, link, targetDir, insertMode, insertWidth, insertAtCursor, loadLink, flash]
  );

  /** Re-pull the bytes over the existing copy, without touching the document. */
  const updateInPlace = useCallback(async () => {
    if (!link) return;
    setBusy(true);
    try {
      const { path, revisions: count } = await api.importPyramidPlot({
        sessionId: detail.sessionId,
        fileId: detail.fileId,
        filename: link.path.split('/').pop() ?? detail.filename,
        sessionTitle: detail.sessionTitle,
        targetDir: link.path.split('/').slice(0, -1).join('/'),
        overwrite: true,
      });
      await loadLink();
      flash(`${path} · ${count ?? 1} revision${count === 1 ? '' : 's'}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [detail, link, loadLink, flash]);

  const close = () => setManagerDetail(null);

  const inputStyle: React.CSSProperties = {
    fontSize: fs.meta,
    fontFamily: font.mono,
    padding: '3px 8px',
    border: '1px solid var(--line)',
    borderRadius: radius.chip,
    background: 'transparent',
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
  };

  return (
    <>
      <Bar height={metrics.header} padding={metrics.padPane} gap={10}>
        <span style={{ fontFamily: font.mono, fontSize: fs.row, color: 'var(--text)' }} title={detail.filename}>
          {detail.filename}
        </span>
        <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>{describeMeta(meta)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          <IconButton size={24} icon={<MinusIcon size={12} />} title="Zoom out" onClick={() => stepZoom(-1)} />
          <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text)', minWidth: 42, textAlign: 'center' }}>
            {fit ? 'fit' : `${Math.round(zoom * 100)}%`}
          </span>
          <IconButton size={24} icon={<PlusIcon size={12} />} title="Zoom in" onClick={() => stepZoom(1)} />
          <OutlinedButton accent={fit} onClick={() => { setFit(true); setZoom(1); }}>Fit</OutlinedButton>
          <OutlinedButton
            icon={<ExternalIcon size={11} />}
            title="Open the original in a new tab"
            onClick={() => window.open(src, '_blank', 'noopener')}
          >
            Open
          </OutlinedButton>
          <IconButton bare size={24} icon={<CloseIcon size={13} />} title="Close" onClick={close} />
        </span>
      </Bar>

      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: fit ? 'hidden' : 'auto',
          background: 'var(--surface-sunken)',
          display: 'flex',
          alignItems: fit ? 'center' : 'flex-start',
          justifyContent: fit ? 'center' : 'flex-start',
          padding: metrics.padPage,
          position: 'relative',
        }}
      >
        <div
          style={{
            background: 'var(--paper-sheet)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-paper)',
            padding: 18,
            display: 'flex',
            flexShrink: 0,
            maxWidth: fit ? '100%' : undefined,
            maxHeight: fit ? '100%' : undefined,
          }}
        >
          <img
            src={src}
            alt={detail.filename}
            style={
              fit
                ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                : { width: `${640 * zoom}px`, maxWidth: 'none' }
            }
          />
        </div>

        <div
          style={{
            position: 'absolute',
            left: metrics.padPage + 8,
            bottom: metrics.padPage + 8,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            border: '1px solid var(--line-strong)',
            borderRadius: radius.control,
            background: 'var(--surface-chrome)',
            padding: '5px 10px',
            fontSize: fs.meta,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          <Dot color="var(--ok)" filled />
          Updated in Pyramid · {formatIsoAge(detail.updatedAt)}
          <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 9, color: 'var(--accent)' }}>
            {link
              ? `${revisions} revision${revisions === 1 ? '' : 's'} here`
              : 'not in this project yet'}
          </span>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          padding: `12px ${metrics.padPane}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SectionLabel>Insert as</SectionLabel>
          {INSERT_MODES.map((m) => (
            <Pill key={m.value} mono={false} active={insertMode === m.value} onClick={() => setInsertMode(m.value)}>
              {m.label}
            </Pill>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: fs.meta, color: 'var(--text-muted)' }}>
            width
            <input
              value={insertWidth}
              onChange={(e) => setInsertWidth(e.target.value)}
              style={{ ...inputStyle, width: 128 }}
            />
          </span>
        </div>

        <Snippet code={snippet} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: fs.meta,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            Copy to
            <input
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              disabled={!!link}
              title={link ? `Already copied to ${link.path}` : 'Directory the figure is copied into'}
              style={{ ...inputStyle, width: 92, opacity: link ? 0.5 : 1 }}
            />
          </span>
          <OutlinedButton
            onClick={updateInPlace}
            disabled={busy || !link}
            title={link ? `Re-pull the bytes over ${link.path}` : 'Insert it once to link it'}
          >
            Update in place
          </OutlinedButton>
          {msg && (
            <span
              style={{
                fontSize: fs.meta,
                color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                transition: `color ${motion.color}`,
              }}
            >
              {msg.text}
            </span>
          )}
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <OutlinedButton accent onClick={() => insert(!!link)} disabled={busy}>
              {busy ? 'Working…' : `Insert at cursor ${ENTER}`}
            </OutlinedButton>
          </span>
        </div>
      </div>
    </>
  );
}
