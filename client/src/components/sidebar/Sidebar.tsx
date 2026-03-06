import FileTree from './FileTree';
import Outline from './Outline';

export default function Sidebar() {
  return (
    <>
      <FileTree />
      <div
        style={{
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      />
      <Outline />
    </>
  );
}
