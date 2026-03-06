import EditorPane from './editor/EditorPane';
import PreviewPane from './preview/PreviewPane';
import SplitPane from './shared/SplitPane';

interface LayoutProps {
  onSave: () => void;
}

export default function Layout({ onSave }: LayoutProps) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <SplitPane
        left={<EditorPane onSave={onSave} />}
        right={<PreviewPane />}
        defaultSplit={0.5}
      />
    </div>
  );
}
