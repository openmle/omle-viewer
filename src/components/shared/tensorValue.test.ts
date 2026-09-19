// Unit tests for tensorValue.ts — TensorValue resolution helpers.

import { describe, test, expect } from 'vitest';
import { tvTensor, tvRefId, tvFloats, tvShape } from './tensorValue.js';
import type { OMLEModel, TensorValue, Tensor } from '@openmle/omle.js';

const denseF32: Tensor = {
  type: { dtype: 'FLOAT32', shape: [2] },
  float32_data: [1.0, 2.0],
};

const denseF64: Tensor = {
  type: { dtype: 'FLOAT64', shape: [3] },
  float64_data: [10.0, 20.0, 30.0],
};

const model: OMLEModel = {
  tensor_entries: [
    { id: 'ref1', dense: denseF32 },
    { id: 'ref2', dense: denseF64 },
  ],
};

// ── tvTensor ──────────────────────────────────────────────────────────────────

describe('tvTensor', () => {
  test('returns inline tensor directly', () => {
    const tv: TensorValue = { tensor: denseF32 };
    expect(tvTensor(tv, null)).toBe(denseF32);
  });

  test('resolves tensor_ref from model entries', () => {
    const tv: TensorValue = { tensor_ref: { id: 'ref2' } };
    expect(tvTensor(tv, model)).toBe(denseF64);
  });

  test('returns null for unknown tensor_ref', () => {
    const tv: TensorValue = { tensor_ref: { id: 'missing' } };
    expect(tvTensor(tv, model)).toBeNull();
  });

  test('returns null for null tv', () => {
    expect(tvTensor(null, model)).toBeNull();
  });

  test('returns null for undefined tv', () => {
    expect(tvTensor(undefined, model)).toBeNull();
  });

  test('returns null for empty tv (no tensor or tensor_ref)', () => {
    expect(tvTensor({}, model)).toBeNull();
  });

  test('resolves tensor_ref with null model → null', () => {
    const tv: TensorValue = { tensor_ref: { id: 'ref1' } };
    expect(tvTensor(tv, null)).toBeNull();
  });
});

// ── tvRefId ───────────────────────────────────────────────────────────────────

describe('tvRefId', () => {
  test('returns ref id when tensor_ref is set', () => {
    const tv: TensorValue = { tensor_ref: { id: 'ref1' } };
    expect(tvRefId(tv)).toBe('ref1');
  });

  test('returns null for inline tensor', () => {
    const tv: TensorValue = { tensor: denseF32 };
    expect(tvRefId(tv)).toBeNull();
  });

  test('returns null for null tv', () => {
    expect(tvRefId(null)).toBeNull();
  });

  test('returns null for undefined tv', () => {
    expect(tvRefId(undefined)).toBeNull();
  });
});

// ── tvFloats ──────────────────────────────────────────────────────────────────

describe('tvFloats', () => {
  test('extracts float32_data from inline tensor', () => {
    const tv: TensorValue = { tensor: denseF32 };
    expect(tvFloats(tv, null)).toEqual([1.0, 2.0]);
  });

  test('extracts float64_data from resolved ref', () => {
    const tv: TensorValue = { tensor_ref: { id: 'ref2' } };
    expect(tvFloats(tv, model)).toEqual([10.0, 20.0, 30.0]);
  });

  test('returns null when tv is null', () => {
    expect(tvFloats(null, model)).toBeNull();
  });

  test('returns null when tensor has no float data', () => {
    const tv: TensorValue = { tensor: { type: { dtype: 'INT32', shape: [] } } };
    expect(tvFloats(tv, null)).toBeNull();
  });
});

// ── tvShape ───────────────────────────────────────────────────────────────────

describe('tvShape', () => {
  test('returns shape from inline tensor', () => {
    const tv: TensorValue = { tensor: denseF32 };
    expect(tvShape(tv, null)).toEqual([2]);
  });

  test('returns shape from resolved ref', () => {
    const tv: TensorValue = { tensor_ref: { id: 'ref2' } };
    expect(tvShape(tv, model)).toEqual([3]);
  });

  test('returns [] for null tv', () => {
    expect(tvShape(null, model)).toEqual([]);
  });

  test('returns [] for unresolvable ref', () => {
    const tv: TensorValue = { tensor_ref: { id: 'nope' } };
    expect(tvShape(tv, model)).toEqual([]);
  });
});
