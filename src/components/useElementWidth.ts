// Shared by every hand-made SVG chart: renders at the container's real pixel
// width (ResizeObserver) so axis/label text never scales down on small screens.
import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function useChartContainer<T extends HTMLElement>(): { ref: RefObject<T | null>; width: number } {
  const ref = useRef<T>(null);
  const width = useElementWidth(ref);
  return { ref, width };
}
