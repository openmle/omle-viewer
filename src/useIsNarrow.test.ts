// Unit tests for useIsNarrow — the breakpoint helper behind the mobile layout.

import { describe, test, expect } from 'vitest';
import { NARROW_BREAKPOINT } from './useIsNarrow.ts';

describe('NARROW_BREAKPOINT', () => {
  test('is wider than the fixed chrome the three-column layout needs', () => {
    // sidebar 240 + inspector 320 + two 4px resize handles.
    const fixedChrome = 240 + 320 + 4 + 4;
    expect(NARROW_BREAKPOINT).toBeGreaterThan(fixedChrome);
  });

  test('classifies common phone and desktop widths', () => {
    const narrow = (w: number) => w <= NARROW_BREAKPOINT;
    expect(narrow(390)).toBe(true);    // iPhone 14
    expect(narrow(414)).toBe(true);    // larger phone
    expect(narrow(768)).toBe(true);    // portrait tablet
    expect(narrow(1024)).toBe(false);  // landscape tablet
    expect(narrow(1440)).toBe(false);  // desktop
  });
});
