// Unit tests for resolveScopedSteps — picking the step list that belongs to the
// composite scope currently on screen.

import { describe, test, expect } from 'vitest';
import { resolveScopedSteps, type ScopedStep } from './scopedSteps.ts';

function step(nodeName: string, children?: ScopedStep[]): ScopedStep {
  return {
    nodeName,
    nodeId: `node:${nodeName}`,
    inputs: {},
    outputs: {},
    warnings: [],
    durationMs: 0,
    ...(children ? { children } : {}),
  } as ScopedStep;
}

const steps: ScopedStep[] = [
  step('pre', [
    step('imputer'),
    step('scaler'),
    step('deeper', [step('leaf_a'), step('leaf_b')]),
  ]),
  step('clf'),
];

describe('resolveScopedSteps', () => {
  test('an empty path yields the top-level steps', () => {
    expect(resolveScopedSteps(steps, [])!.map(s => s.nodeName)).toEqual(['pre', 'clf']);
  });

  test('a one-level path yields that composite’s interior', () => {
    expect(resolveScopedSteps(steps, ['pre'])!.map(s => s.nodeName))
      .toEqual(['imputer', 'scaler', 'deeper']);
  });

  test('a nested path descends through both composites', () => {
    expect(resolveScopedSteps(steps, ['pre', 'deeper'])!.map(s => s.nodeName))
      .toEqual(['leaf_a', 'leaf_b']);
  });

  test('interior ids keep the node: scheme so they match the drilled-in graph', () => {
    expect(resolveScopedSteps(steps, ['pre'])!.map(s => s.nodeId))
      .toEqual(['node:imputer', 'node:scaler', 'node:deeper']);
  });

  test('null when the named scope captured no interior', () => {
    // 'clf' is not a composite, so there is nothing to descend into. Returning
    // the enclosing scope's steps instead would highlight nodes that are not
    // on screen.
    expect(resolveScopedSteps(steps, ['clf'])).toBeNull();
  });

  test('null when the path names a node that does not exist', () => {
    expect(resolveScopedSteps(steps, ['nope'])).toBeNull();
  });

  test('null when there are no steps at all', () => {
    expect(resolveScopedSteps(null, [])).toBeNull();
    expect(resolveScopedSteps(undefined, ['pre'])).toBeNull();
  });

  test('null for a deep path whose intermediate scope has no interior', () => {
    expect(resolveScopedSteps(steps, ['pre', 'scaler'])).toBeNull();
  });
});
