import { useEffect, useRef, useState } from 'react';

/**
 * Track an element's own width. Panes here are resized by the splitter rather
 * than by the window, so a media query would ask the wrong question — the
 * element has to be measured directly.
 *
 * Width is 0 until the first observation; callers should read that as
 * "unmeasured" and render their roomiest layout, so nothing flashes narrow on
 * the first paint.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setWidth(entry ? entry.contentRect.width : el.clientWidth);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
