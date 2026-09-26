// Resolving inference steps for the composite scope currently on screen.

import type { StepSnapshot } from '@openmle/omle.js';

/**
 * A step plus the interior steps of a composite node.
 *
 * `children` is an additive, optional field on the engine's StepSnapshot, but
 * the published @openmle/omle.js types do not carry it yet. Declaring it here
 * keeps the drill-down code typed; drop this alias and use StepSnapshot
 * directly once the release that includes it is picked up.
 */
export type ScopedStep = StepSnapshot & { children?: ScopedStep[] };

/**
 * The steps belonging to the scope named by `compositePath`.
 *
 * Drilling into a composite replaces the canvas with that composite's
 * interior, so the playback has to follow it down: a composite runs a whole
 * subgraph and reports a single step at the top level, with the interior
 * hanging off it as `children`. Without following the path, no step would
 * carry the ids of the nodes actually on screen and none of them could ever
 * light up.
 *
 * Returns null when the path names a scope whose interior was not captured —
 * an empty composite, or steps produced by an engine predating nested capture.
 * Null is deliberately not "fall back to the enclosing scope": those steps
 * belong to nodes that are not on screen, and replaying them would highlight
 * nothing while looking like it had finished.
 */
export function resolveScopedSteps(
  steps: readonly StepSnapshot[] | null | undefined,
  compositePath: readonly string[],
): ScopedStep[] | null {
  if (!steps) return null;
  let current = steps as readonly ScopedStep[];
  for (const name of compositePath) {
    const enclosing = current.find(st => st.nodeName === name);
    if (!enclosing?.children) return null;
    current = enclosing.children;
  }
  return current as ScopedStep[];
}
