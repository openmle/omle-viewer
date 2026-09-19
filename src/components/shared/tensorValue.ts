// Small helpers for resolving TensorValue fields from structured model bodies.
// TensorValue is a oneof { tensor | sparse | tensor_ref } introduced to unify
// inline and referenced tensor storage.

import type { OMLEModel, TensorValue, Tensor } from '@openmle/omle.js';

export function tvTensor(
  tv: TensorValue | null | undefined,
  model: OMLEModel | null | undefined,
): Tensor | null {
  if (!tv) return null;
  if (tv.tensor) return tv.tensor;
  if (tv.tensor_ref) {
    const entry = model?.tensor_entries?.find(e => e.id === tv.tensor_ref!.id);
    return entry?.dense ?? null;
  }
  return null;
}

// The TensorEntry id, if the value is stored by reference (for navigation links).
export function tvRefId(tv: TensorValue | null | undefined): string | null {
  return tv?.tensor_ref?.id ?? null;
}

export function tvFloats(
  tv: TensorValue | null | undefined,
  model: OMLEModel | null | undefined,
): number[] | null {
  const t = tvTensor(tv, model);
  if (!t) return null;
  return (t.float64_data as number[] | undefined)
      ?? (t.float32_data as number[] | undefined)
      ?? null;
}

export function tvShape(
  tv: TensorValue | null | undefined,
  model: OMLEModel | null | undefined,
): number[] {
  const t = tvTensor(tv, model);
  return t?.type?.shape?.map(Number) ?? [];
}
