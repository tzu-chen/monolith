import { useCallback, useRef, useState, type ReactNode } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number; // 0-1, default 0.5
}

export default function SplitPane({ left, right, defaultSplit = 0.5 }: SplitPaneProps) {
  const [splitRatio, setSplitRatio] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0.2, Math.min(0.8, x / rect.width));
      setSplitRatio(ratio);
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
    >
      <div style={{ width: `${splitRatio * 100}%`, display: 'flex', overflow: 'hidden' }}>
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 5,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          cursor: 'col-resize',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 3,
            height: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            alignItems: 'center',
          }}
        >
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-strong)' }} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {right}
      </div>
    </div>
  );
}
