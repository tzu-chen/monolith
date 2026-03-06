import { useMemo } from 'react';

export interface OutlineEntry {
  level: number;
  title: string;
  line: number;
}

const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
};

const SECTION_REGEX = /\\(part|chapter|section|subsection|subsubsection|paragraph)\{([^}]*)\}/g;

export function useOutline(content: string): OutlineEntry[] {
  return useMemo(() => {
    const entries: OutlineEntry[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      SECTION_REGEX.lastIndex = 0;
      while ((match = SECTION_REGEX.exec(line)) !== null) {
        entries.push({
          level: SECTION_LEVELS[match[1]] ?? 2,
          title: match[2],
          line: i + 1, // 1-indexed
        });
      }
    }

    return entries;
  }, [content]);
}
