import { useEffect, useState } from 'react';

/**
 * Width below which the three-column layout stops fitting.
 *
 * The sidebar (240) and inspector (320) are fixed-width, so with the two
 * resize handles they claim 568px before the graph gets any. Under ~840px the
 * centre column is squeezed to nothing and the inspector is pushed off-screen
 * entirely, which is what makes the viewer unusable on a phone.
 */
export const NARROW_BREAKPOINT = 840;

/** True while the viewport is too narrow for side-by-side panels. */
export function useIsNarrow(breakpoint: number = NARROW_BREAKPOINT): boolean {
  const query = `(max-width: ${breakpoint}px)`;

  // Read synchronously on first render so the first paint is already correct;
  // guarded for non-browser environments, where the tests render this.
  const [isNarrow, setIsNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    setIsNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return isNarrow;
}
