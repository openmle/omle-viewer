// Generates a plausible random inference input payload from the model schema.
// Uses dtype, shape, and feature domain/discrete values to produce realistic data.

import type { OMLEModel, Feature, Scalar, ValueDomain } from '@openmle/omle.js';
import { scalarValue } from '@openmle/omle.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(s: Scalar | undefined | null): number | undefined {
  const v = scalarValue(s ?? undefined);
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : undefined;
}

function isIntDtype(dtype: string): boolean {
  return dtype.startsWith('INT') || dtype.startsWith('UINT');
}

function isStringDtype(dtype: string): boolean {
  return dtype === 'STRING' || dtype === 'BYTES';
}

function isBoolDtype(dtype: string): boolean {
  return dtype === 'BOOL';
}

// ── Single value generator ────────────────────────────────────────────────────

function generateScalar(dtype: string, domain?: ValueDomain, featureName?: string): number | string | boolean {
  // String / bytes
  if (isStringDtype(dtype)) {
    if (domain?.discrete?.values?.length) {
      const valid = domain.discrete.values.filter(v => v.property !== 'INVALID' && v.property !== 'MISSING');
      if (valid.length) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        const v = scalarValue(pick.value);
        return typeof v === 'string' ? v : String(v ?? '');
      }
    }
    return featureName ?? 'value';
  }

  // Boolean
  if (isBoolDtype(dtype)) {
    if (domain?.discrete?.values?.length) {
      const valid = domain.discrete.values.filter(v => v.property !== 'INVALID' && v.property !== 'MISSING');
      if (valid.length) {
        const pick = valid[Math.floor(Math.random() * valid.length)];
        return Boolean(toNum(pick.value) ?? Math.random() > 0.5);
      }
    }
    return Math.random() > 0.5;
  }

  // Numeric — discrete domain
  if (domain?.discrete?.values?.length) {
    const valid = domain.discrete.values.filter(v => v.property !== 'INVALID' && v.property !== 'MISSING');
    if (valid.length) {
      const pick = valid[Math.floor(Math.random() * valid.length)];
      return toNum(pick.value) ?? 0;
    }
  }

  // Numeric — continuous interval
  if (domain?.continuous?.intervals?.length) {
    const interval = domain.continuous.intervals[0];
    const lo = toNum(interval.left_margin) ?? 0;
    const hi = toNum(interval.right_margin) ?? 1;
    const v = lo + Math.random() * (hi - lo);
    return isIntDtype(dtype) ? Math.round(v) : Math.round(v * 1000) / 1000;
  }

  // Default fallback
  if (isIntDtype(dtype)) return Math.floor(Math.random() * 10);
  return Math.round(Math.random() * 1000) / 1000;
}

// ── Expand feature list ───────────────────────────────────────────────────────

interface FlatFeature {
  name: string;
  feature: Feature;
}

function expandFeatures(features: Feature[]): FlatFeature[] {
  const result: FlatFeature[] = [];
  for (const feat of features) {
    if (feat.range) {
      const { prefix, start = 0, end, width = 0 } = feat.range;
      for (let i = start; i < end; i++) {
        const padded = width > 0 ? String(i).padStart(width, '0') : String(i);
        result.push({ name: `${prefix}${padded}`, feature: feat });
      }
    } else if (feat.name) {
      result.push({ name: feat.name, feature: feat });
    }
  }
  return result;
}

// ── Generate value for one input ──────────────────────────────────────────────

function generateValue(
  dtype: string,
  shape: number[],
  columns: FlatFeature[],
): unknown {
  // Resolve batch dimension: treat -1/0 as 1
  const dims = shape.map(d => (Number(d) <= 0 ? 1 : Number(d)));

  // Scalar (no shape or all dims resolved to 1 with empty rank)
  if (dims.length === 0) {
    return generateScalar(dtype, columns[0]?.feature.domain, columns[0]?.name);
  }

  // 1-D vector
  if (dims.length === 1) {
    const n = dims[0];
    return Array.from({ length: n }, (_, i) => {
      const col = columns[i] ?? columns[0];
      return generateScalar(dtype, col?.feature.domain, col?.name);
    });
  }

  // 2-D matrix: [rows, cols]  — generate as nested array
  const [rows, cols] = dims;
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (_, ci) => {
      const col = columns[ci] ?? columns[0];
      return generateScalar(dtype, col?.feature.domain, col?.name);
    }),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSampleInput(model: OMLEModel): string {
  const inputs = model.inputs ?? [];
  const features = expandFeatures(model.model_schema?.features ?? []);

  const obj: Record<string, unknown> = {};

  if (inputs.length > 0) {
    for (const inp of inputs) {
      const dtype = inp.type?.dtype ?? 'FLOAT32';
      const shape = (inp.type?.shape ?? []).map(Number);

      // Find features that belong to this input (by source or by input name match)
      let cols = features.filter(f => f.feature.source === inp.name);
      if (!cols.length) cols = features;

      obj[inp.name] = generateValue(dtype, shape, cols);
    }
  } else {
    // No declared inputs — fall back to individual feature columns
    for (const { name, feature } of features) {
      const dtype = feature.type?.dtype ?? 'FLOAT32';
      obj[name] = generateScalar(dtype, feature.domain, name);
    }
  }

  return JSON.stringify(obj, null, 2);
}
