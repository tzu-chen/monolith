import { useEditorStore } from '../../stores/editorStore';
import { CloseIcon } from '../shared/Icons';

export default function TabBar() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (openTabs.length === 0) return null;

  return (
    <div
      style={{
        height: 34,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          overflow: 'auto',
          flex: 1,
        }}
      >
        {openTabs.map((tab) => {
          const isActive = tab.path === activeTabPath;
          const fileName = tab.path.split('/').pop() || tab.path;

          return (
            <div
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                fontSize: 12,
                cursor: 'pointer',
                borderRight: '1px solid var(--border)',
                background: isActive ? 'var(--bg-editor)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 500 : 400,
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={tab.path}
              >
                {fileName}
              </span>
              {tab.dirty && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                style={{
                  fontSize: 14,
                  lineHeight: 1,
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  borderRadius: 3,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'var(--bg-hover)';
                  (e.target as HTMLElement).style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.color = 'var(--text-dim)';
                }}
              >
                <CloseIcon size={12} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
